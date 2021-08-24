import React, { FC, memo } from 'react';
import DashboardSearch from './DashboardSearch';
import { useUrlParams } from 'app/core/navigation/hooks';
import { defaultQueryParams } from '../reducers/searchQueryReducer';
import { KioskMode } from '../../../types';

export const SearchWrapper: FC = memo(() => {
  const [params, updateUrlParams] = useUrlParams();
  const isOpen = params.get('search') === 'open';
  const query = new URLSearchParams(location.search);
  const kiosk = query.get('kiosk') as KioskMode;
  if (kiosk === 'tv') {
    return null;
  }

  const closeSearch = () => {
    if (isOpen) {
      updateUrlParams({ search: null, folder: null, ...defaultQueryParams });
    }
  };

  return isOpen ? <DashboardSearch onCloseSearch={closeSearch} /> : null;
});

SearchWrapper.displayName = 'SearchWrapper';
