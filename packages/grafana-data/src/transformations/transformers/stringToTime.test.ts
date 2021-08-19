import { toDataFrame } from '../../dataframe/processDataFrame';
import { FieldType } from '../../types/dataFrame';
import { mockTransformationsRegistry } from '../../utils/tests/mockTransformationsRegistry';
import { DataTransformerID } from './ids';
import { stringToTime, stringToTimeTransformer } from './stringToTime';

const stringTime = toDataFrame({
  fields: [
    {
      name: 'proper dates',
      type: FieldType.string,
      values: [
        '2021-07-19 00:00:00.000',
        '2021-07-23 00:00:00.000',
        '2021-07-25 00:00:00.000',
        '2021-08-01 00:00:00.000',
        '2021-08-02 00:00:00.000',
      ],
    },
    { name: 'A', type: FieldType.number, values: [1, 2, 3, 4, 5] },
  ],
});

const noData = toDataFrame({
  fields: [
    { name: 'A', type: FieldType.string, values: [] },
    { name: 'B', type: FieldType.string, values: [null, null, null, null] },
  ],
});

const notTimeUnit = toDataFrame({
  fields: [
    { name: 'A', type: FieldType.number, values: [1, 2, 3, 4, 5] },
    {
      name: 'proper dates',
      type: FieldType.string,
      values: [
        '2021-07-19 00:00:00.000',
        '2021-07-23 00:00:00.000',
        '2021-07-25 00:00:00.000',
        '2021-08-01 00:00:00.000',
        '2021-08-02 00:00:00.000',
      ],
      config: { unit: '' },
    },
  ],
});

const noTimeSeries = toDataFrame({
  fields: [
    { name: 'A', type: FieldType.number, values: [1, 2, 3, 4, 5] },
    { name: 'B', type: FieldType.number, values: [10, 12, 30, 14, 10] },
  ],
});

const misformattedStrings = toDataFrame({
  fields: [
    {
      name: 'misformatted dates',
      type: FieldType.string,
      values: ['2021/08-01 00:00.00:000', '2021/08/01 00.00-000', '2021/08-01 00:00.00:000'],
      config: { unit: 'time' },
    },
    { name: 'A', type: FieldType.number, values: [1, 2, 3, 4, 5] },
  ],
});

//add case for dates with specified format
describe('string to time', () => {
  beforeAll(() => {
    mockTransformationsRegistry([stringToTimeTransformer]);
  });

  it('will parse properly formatted strings to time', () => {
    const options = {
      targetField: 'proper dates',
    };

    const timeified = stringToTime(options, [stringTime]);
    expect(
      timeified[0].fields.map((f) => ({
        name: f.name,
        type: f.type,
        values: f.values.toArray(),
        config: f.config,
      }))
    ).toMatchInlineSnapshot(`
              Array [
                Object {
                  "config": Object {},
                  "name": "proper dates",
                  "type": "time",
                  "values": Array [
                    "2021-07-19 00:00:00.000",
                    "2021-07-23 00:00:00.000",
                    "2021-07-25 00:00:00.000",
                    "2021-08-01 00:00:00.000",
                    "2021-08-02 00:00:00.000",
                  ],
                },
                Object {
                  "config": Object {},
                  "name": "A",
                  "type": "number",
                  "values": Array [
                      1,
                      2,
                      3,
                      4,
                      5,
                  ],
                },
              ]
            `);
  });

  it('will not parse improperly formatted date strings', () => {
    const options = {
      targetField: 'misformatted dates',
    };

    const timeified = stringToTime(options, [misformattedStrings]);
    expect(
      timeified[0].fields.map((f) => ({
        name: f.name,
        type: f.type,
        values: f.values.toArray(),
        config: f.config,
      }))
    ).toMatchInlineSnapshot(`
            Array [
              Object {
                "config": Object {
                },
                "name": "misformatted dates",
                "type": "string",
                "values": Array [
                      "2021/08-01 00:00.00:000",
                      "2021/08/01 00.00-000",
                      "2021/08-01 00:00.00:000",
                      undefined,
                      undefined,
                    ],
                },
              Object {
                "config": Object {},
                "name": "A",
                "type": "number",
                "values": Array [
                    1,
                    2,
                    3,
                    4,
                    5,
                ],
              },
            ]
          `);
  });
});
