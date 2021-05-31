package server

import (
	"context"
	"errors"
	"fmt"
	"io/ioutil"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"sync"

	"golang.org/x/sync/errgroup"

	"github.com/grafana/grafana/pkg/api"
	_ "github.com/grafana/grafana/pkg/extensions"
	"github.com/grafana/grafana/pkg/infra/backgroundsvcs"
	"github.com/grafana/grafana/pkg/infra/log"
	"github.com/grafana/grafana/pkg/infra/metrics"
	_ "github.com/grafana/grafana/pkg/infra/remotecache"
	_ "github.com/grafana/grafana/pkg/infra/serverlock"
	_ "github.com/grafana/grafana/pkg/infra/tracing"
	_ "github.com/grafana/grafana/pkg/infra/usagestats"
	"github.com/grafana/grafana/pkg/login"
	"github.com/grafana/grafana/pkg/login/social"
	_ "github.com/grafana/grafana/pkg/plugins/manager"
	"github.com/grafana/grafana/pkg/registry"
	_ "github.com/grafana/grafana/pkg/services/alerting"
	_ "github.com/grafana/grafana/pkg/services/auth"
	_ "github.com/grafana/grafana/pkg/services/auth/jwt"
	_ "github.com/grafana/grafana/pkg/services/cleanup"
	_ "github.com/grafana/grafana/pkg/services/librarypanels"
	_ "github.com/grafana/grafana/pkg/services/login/loginservice"
	_ "github.com/grafana/grafana/pkg/services/ngalert"
	_ "github.com/grafana/grafana/pkg/services/notifications"
	_ "github.com/grafana/grafana/pkg/services/provisioning"
	_ "github.com/grafana/grafana/pkg/services/rendering"
	_ "github.com/grafana/grafana/pkg/services/search"
	_ "github.com/grafana/grafana/pkg/services/sqlstore"
	"github.com/grafana/grafana/pkg/setting"
)

// Options contains parameters for the New function.
type Options struct {
	HomePath    string
	PidFile     string
	Version     string
	Commit      string
	BuildBranch string
	Listener    net.Listener
}

type serviceRegistry interface {
	IsDisabled(srv registry.Service) bool
	GetServices() []*registry.Descriptor
}

type globalServiceRegistry struct{}

func (r *globalServiceRegistry) IsDisabled(srv registry.Service) bool {
	return registry.IsDisabled(srv)
}

func (r *globalServiceRegistry) GetServices() []*registry.Descriptor {
	return registry.GetServices()
}

// New returns a new instance of Server.
func New(opts Options, cfg *setting.Cfg, httpServer *api.HTTPServer, backgroundServices *backgroundsvcs.Container) (*Server, error) {
	rootCtx, shutdownFn := context.WithCancel(context.Background())

	s := &Server{
		context:            rootCtx,
		HTTPServer:         httpServer,
		shutdownFn:         shutdownFn,
		shutdownFinished:   make(chan struct{}),
		log:                log.New("server"),
		cfg:                cfg,
		pidFile:            opts.PidFile,
		version:            opts.Version,
		commit:             opts.Commit,
		buildBranch:        opts.BuildBranch,
		backgroundServices: backgroundServices,
	}
	if err := s.init(); err != nil {
		return nil, err
	}

	return s, nil
}

// Server is responsible for managing the lifecycle of services.
type Server struct {
	context          context.Context
	shutdownFn       context.CancelFunc
	log              log.Logger
	cfg              *setting.Cfg
	shutdownOnce     sync.Once
	shutdownFinished chan struct{}
	isInitialized    bool
	mtx              sync.Mutex

	pidFile            string
	version            string
	commit             string
	buildBranch        string
	backgroundServices *backgroundsvcs.Container

	HTTPServer *api.HTTPServer
}

// init initializes the server and its services.
func (s *Server) init() error {
	s.mtx.Lock()
	defer s.mtx.Unlock()

	if s.isInitialized {
		return nil
	}
	s.isInitialized = true

	s.writePIDFile()
	if err := metrics.SetEnvironmentInformation(s.cfg.MetricsGrafanaEnvironmentInfo); err != nil {
		return err
	}

	login.Init()
	social.NewOAuthService()

	return s.HTTPServer.SQLStore.Migrate()
}

// Run initializes and starts services. This will block until all services have
// exited. To initiate shutdown, call the Shutdown method in another goroutine.
func (s *Server) Run() error {
	defer close(s.shutdownFinished)

	if err := s.init(); err != nil {
		return err
	}

	// Start background services.
	eg, ctx := errgroup.WithContext(s.context)
	for _, svc := range s.backgroundServices.BackgroundServices {
		canBeDisabled, ok := svc.(registry.CanBeDisabled)
		if ok && canBeDisabled.IsDisabled() {
			continue
		}

		// Variable is needed for accessing loop variable in callback
		service := svc
		eg.Go(func() error {
			select {
			case <-ctx.Done():
				return ctx.Err()
			default:
			}
			err := service.Run(ctx)
			// Do not return context.Canceled error since errgroup.Group only
			// returns the first error to the caller - thus we can miss a more
			// interesting error.
			if err != nil && !errors.Is(err, context.Canceled) {
				s.log.Error("Stopped background service", "reason", err)
				return fmt.Errorf("background service run error: %w", err)
			}
			s.log.Debug("Stopped background service", "reason", err)
			return nil
		})
	}

	s.notifySystemd("READY=1")

	s.log.Debug("Waiting on services...")
	return eg.Wait()
}

// Shutdown initiates Grafana graceful shutdown. This shuts down all
// running background services. Since Run blocks Shutdown supposed to
// be run from a separate goroutine.
func (s *Server) Shutdown(ctx context.Context, reason string) error {
	var err error
	s.shutdownOnce.Do(func() {
		s.log.Info("Shutdown started", "reason", reason)
		// Call cancel func to stop services.
		s.shutdownFn()
		// Wait for server to shut down
		select {
		case <-s.shutdownFinished:
			s.log.Debug("Finished waiting for server to shut down")
		case <-ctx.Done():
			s.log.Warn("Timed out while waiting for server to shut down")
			err = fmt.Errorf("timeout waiting for shutdown")
		}
	})

	return err
}

// ExitCode returns an exit code for a given error.
func (s *Server) ExitCode(runError error) int {
	if runError != nil {
		s.log.Error("Server shutdown", "error", runError)
		return 1
	}
	return 0
}

// writePIDFile retrieves the current process ID and writes it to file.
func (s *Server) writePIDFile() {
	if s.pidFile == "" {
		return
	}

	// Ensure the required directory structure exists.
	err := os.MkdirAll(filepath.Dir(s.pidFile), 0700)
	if err != nil {
		s.log.Error("Failed to verify pid directory", "error", err)
		os.Exit(1)
	}

	// Retrieve the PID and write it to file.
	pid := strconv.Itoa(os.Getpid())
	if err := ioutil.WriteFile(s.pidFile, []byte(pid), 0644); err != nil {
		s.log.Error("Failed to write pidfile", "error", err)
		os.Exit(1)
	}

	s.log.Info("Writing PID file", "path", s.pidFile, "pid", pid)
}

// notifySystemd sends state notifications to systemd.
func (s *Server) notifySystemd(state string) {
	notifySocket := os.Getenv("NOTIFY_SOCKET")
	if notifySocket == "" {
		s.log.Debug(
			"NOTIFY_SOCKET environment variable empty or unset, can't send systemd notification")
		return
	}

	socketAddr := &net.UnixAddr{
		Name: notifySocket,
		Net:  "unixgram",
	}
	conn, err := net.DialUnix(socketAddr.Net, nil, socketAddr)
	if err != nil {
		s.log.Warn("Failed to connect to systemd", "err", err, "socket", notifySocket)
		return
	}
	defer func() {
		if err := conn.Close(); err != nil {
			s.log.Warn("Failed to close connection", "err", err)
		}
	}()

	_, err = conn.Write([]byte(state))
	if err != nil {
		s.log.Warn("Failed to write notification to systemd", "err", err)
	}
}
