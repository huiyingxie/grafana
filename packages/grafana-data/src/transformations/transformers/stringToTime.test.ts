import { toDataFrame } from '../../dataframe/processDataFrame';
import { FieldType } from '../../types/dataFrame';
import { mockTransformationsRegistry } from '../../utils/tests/mockTransformationsRegistry';
import { ensureTimeField, stringToTime, stringToTimeTransformer } from './stringToTime';

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
describe('field conversion transformer', () => {
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
    ).toEqual([
      {
        config: {},
        name: 'proper dates',
        type: 'time',
        values: [1626674400000, 1627020000000, 1627192800000, 1627797600000, 1627884000000],
      },
      { config: {}, name: 'A', type: 'number', values: [1, 2, 3, 4, 5] },
    ]);
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
    ).toEqual([
      {
        name: 'misformatted dates',
        type: FieldType.time,
        values: [undefined, undefined, undefined, undefined, undefined],
        config: { unit: 'time' },
      },
      { config: {}, name: 'A', type: FieldType.number, values: [1, 2, 3, 4, 5] },
    ]);
  });
});

describe('string to time field with specified date format', () => {
  it('will convert a field to a specified date format', () => {
    const options = {
      targetField: 'proper dates',
      type: 'time',
      dateFormat: 'YYYY-MM-DD HH:MM:SS',
    };

    const timeified = ensureTimeField(stringTime.fields[0], options.dateFormat);
    expect(timeified).toEqual({
      name: 'proper dates',
      type: FieldType.time,
      values: [
        '2021-07-19 00:00:00',
        '2021-07-23 00:00:00',
        '2021-07-25 00:00:00',
        '2021-08-01 00:00:00',
        '2021-08-02 00:00:00',
      ],
      config: {},
    });
  });
});
