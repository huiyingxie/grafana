import { SynchronousDataTransformerInfo } from '../../types';
import { map } from 'rxjs/operators';

import { DataTransformerID } from './ids';
import { DataFrame } from '../../types/dataFrame';
import { data } from 'jquery';
import { dateTimeParse } from '../../datetime';
import { cloneDeep } from 'lodash';
import { ArrayVector } from '../../vector';

export interface StringToTimeTransformerOptions {
  targetField: string | undefined;
  dateFormat?: string;
}

interface FrameFieldIdx {
  frameIdx: number;
  fieldIdx: number;
}

/**
 * This is a helper class to use the same text in both a panel and transformer UI
 *
 * @internal
 */
export const stringToTimeFieldInfo = {
  targetField: {
    label: 'Target field',
    description: 'Select the target field to parse',
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
export function stringToTime(options: StringToTimeTransformerOptions, frames: DataFrame[]): DataFrame[] | undefined {
  if (!options.targetField) {
    return undefined;
  }

  //get idx of dataFrame and field
  const frameFieldIdxs = findIndicesByFieldName(options.targetField, frames);

  //if there's an idx
  if (frameFieldIdxs) {
    const targetFrame = frames[frameFieldIdxs.frameIdx];
    const targetFieldValues = targetFrame.fields[frameFieldIdxs.fieldIdx].values.toArray();

    let timeArray = new ArrayVector();
    for (let i = 0; i < targetFieldValues.length; i++) {
      const parsed = dateTimeParse(targetFieldValues[i]);
      //TODO
      //validate if time otherwise handle error
      timeArray.add(parsed);
    }

    //TODO
    //add error handling specific to transformers?
    if (timeArray.length < targetFieldValues.length) {
      return undefined;
    }

    const framesCopy = cloneDeep(frames);
    framesCopy[frameFieldIdxs.frameIdx].fields[frameFieldIdxs.fieldIdx].values = timeArray;
    return framesCopy;
  }
  return undefined;
}

/**
 * helper function to get indices for dataframe and field
 */
function findIndicesByFieldName(targetField: string, frames: DataFrame[]): FrameFieldIdx | undefined {
  for (let frameIndex = 0; frameIndex < data.length; frameIndex++) {
    const frame = frames[frameIndex];

    for (let fieldIndex = 0; fieldIndex < frame.fields.length; fieldIndex++) {
      const field = frame.fields[fieldIndex];
      if (field.name === targetField) {
        return { frameIdx: frameIndex, fieldIdx: fieldIndex };
      }
    }
  }
  return undefined;
}
