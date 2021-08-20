import React, { useCallback } from 'react';
import {
  DataTransformerID,
  SelectableValue,
  standardTransformers,
  TransformerRegistryItem,
  TransformerUIProps,
} from '@grafana/data';

import {
  StringToTimeTransformerOptions,
  stringToTimeFieldInfo,
} from '@grafana/data/src/transformations/transformers/stringToTime';
import { InlineField, InlineFieldRow, Select } from '@grafana/ui';
import { useAllFieldNamesFromDataFrames } from './utils';

export const StringToTimeTransformerEditor: React.FC<TransformerUIProps<StringToTimeTransformerOptions>> = ({
  input,
  options,
  onChange,
}) => {
  const fieldNames = useAllFieldNamesFromDataFrames(input);
  const selectableFieldNames = fieldNames.map((f) => ({ label: f, value: f }));

  const onSelectField = useCallback(
    (value: SelectableValue<string>) => {
      onChange({
        ...options,
        targetField: value.value,
      });
    },
    [onChange, options]
  );

  //TODO
  //show units for fields
  //add date format option
  return (
    <div>
      <InlineFieldRow>
        <InlineField label={stringToTimeFieldInfo.targetField.label} grow={true}>
          <Select
            menuShouldPortal
            options={selectableFieldNames}
            value={options.targetField}
            placeholder={stringToTimeFieldInfo.targetField.description}
            onChange={onSelectField}
          />
        </InlineField>
      </InlineFieldRow>
    </div>
  );
};

export const stringToTimeTransformRegistryItem: TransformerRegistryItem<StringToTimeTransformerOptions> = {
  id: DataTransformerID.stringToTime,
  editor: StringToTimeTransformerEditor,
  transformation: standardTransformers.stringToTimeTransformer,
  name: standardTransformers.stringToTimeTransformer.name,
  description: standardTransformers.stringToTimeTransformer.description,
};
