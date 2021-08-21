import { SynchronousDataTransformerInfo } from '../../types';
import { map } from 'rxjs/operators';

import { DataTransformerID } from './ids';
import { DataFrame, Field, FieldType } from '../../types/dataFrame';
import { dateTimeParse } from '../../datetime';
import { isFinite, isNumber } from 'lodash';
import { ArrayVector } from '../../vector';

export interface StringToTimeTransformerOptions {
  targetField: string | undefined;
  dateFormat?: string;
}

export interface FieldConversionOptions {
  name: string;
  type: FieldType;
  dateFormat?: string;
}

/**
 * This is a helper class to use the same text in both a panel and transformer UI
 *
 * @internal
 */
export const stringToTimeFieldInfo = {
  targetField: {
    label: 'Target field',
    description: 'Select the target field',
  },
  destinationType: {
    label: 'Type to convert to',
    description: 'Select the type to convert',
  },
  dateFormat: {
    label: 'Date Format',
    description: 'Select the desired date format',
  },
};

/**
 * @alpha
 */
export const stringToTimeTransformer: SynchronousDataTransformerInfo<StringToTimeTransformerOptions> = {
  id: DataTransformerID.stringToTime,
  name: 'String to Time',
  description: 'Make a string field a time field',
  defaultOptions: {
    fields: {},
  },

  operator: (options) => (source) => source.pipe(map((data) => stringToTimeTransformer.transformer(options)(data))),

  transformer: (options: StringToTimeTransformerOptions) => (data: DataFrame[]) => {
    if (!Array.isArray(data) || data.length === 0) {
      return data;
    }
    const timeParsed = stringToTime(options, data);
    if (!timeParsed) {
      return [];
    }
    return timeParsed;
  },
};

/**
 * @alpha
 */
export function stringToTime(options: StringToTimeTransformerOptions, frames: DataFrame[]): DataFrame[] {
  if (!options.targetField) {
    return frames;
  }

  const frameCopy: DataFrame[] = [];

  for (const frame of frames) {
    for (let i = 0; i < frame.fields.length; i++) {
      let field = frame.fields[i];
      if (field.name === options.targetField) {
        //check in about matchers with Ryan
        frame.fields[i] = ensureTimeField(field, options.dateFormat);
        break;
      }
    }
    frameCopy.push(frame);
  }
  return frameCopy;
}

function stringToTimeField(field: Field, dateFormat?: string): Field {
  const timeValues = field.values.toArray().map((value) => {
    if (value) {
      let parsed;
      if (dateFormat) {
        parsed = dateTimeParse(value, { format: dateFormat });
      } else {
        parsed = dateTimeParse(value).valueOf();
      }
      return isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  });

  return {
    ...field,
    type: FieldType.time,
    values: new ArrayVector(timeValues),
  };
}

export function ensureTimeField(field: Field, dateFormat?: string): Field {
  //already time
  if ((field.type === FieldType.time && field.values.length) || isNumber(field.values.get(0))) {
    return field;
  }
  //TO DO
  //add more checks
  return stringToTimeField(field, dateFormat);
}
