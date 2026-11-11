import React from "react";
import { Control, Controller } from "react-hook-form";
import {
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  FormControlLabel,
  Switch,
  Autocomplete,
  InputAdornment,
  Grid,
} from "@mui/material";
import { FieldDef } from "./types";

interface DynamicFieldsProps {
  fields: FieldDef[];
  control: Control<any>;
  namePrefix?: string;
  readOnly?: boolean;
}

export const DynamicFields: React.FC<DynamicFieldsProps> = ({
  fields,
  control,
  namePrefix = "values",
  readOnly = false,
}) => {
  const activeFields = fields.filter((f) => !f.archived);

  if (activeFields.length === 0) {
    return null;
  }

  return (
    <Grid container spacing={2}>
      {activeFields.map((field) => {
        const fieldName = `${namePrefix}.${field.key}`;
        const isFullWidth = field.type === "longtext" || field.type === "checkbox";

        let fieldContent = null;

        switch (field.type) {
          case "text":
            fieldContent = (
              <Controller
                key={field.key}
                name={fieldName}
                control={control}
                defaultValue=""
                render={({ field: formField, fieldState: { error } }) => (
                  <TextField
                    {...formField}
                    label={field.label}
                    required={field.required}
                    helperText={error?.message || field.hint}
                    error={Boolean(error)}
                    disabled={readOnly}
                    fullWidth
                    slotProps={{
                      input: {
                        endAdornment: field.unit ? (
                          <InputAdornment position="end">{field.unit}</InputAdornment>
                        ) : undefined,
                      },
                    }}
                  />
                )}
              />
            );
            break;

          case "longtext":
            fieldContent = (
              <Controller
                key={field.key}
                name={fieldName}
                control={control}
                defaultValue=""
                render={({ field: formField, fieldState: { error } }) => (
                  <TextField
                    {...formField}
                    label={field.label}
                    required={field.required}
                    helperText={error?.message || field.hint}
                    error={Boolean(error)}
                    multiline
                    rows={3}
                    disabled={readOnly}
                    fullWidth
                  />
                )}
              />
            );
            break;

          case "number":
            fieldContent = (
              <Controller
                key={field.key}
                name={fieldName}
                control={control}
                defaultValue=""
                render={({ field: formField, fieldState: { error } }) => (
                  <TextField
                    {...formField}
                    type="number"
                    label={field.label}
                    required={field.required}
                    helperText={error?.message || field.hint}
                    error={Boolean(error)}
                    disabled={readOnly}
                    fullWidth
                    slotProps={{
                      input: {
                        endAdornment: field.unit ? (
                          <InputAdornment position="end">{field.unit}</InputAdornment>
                        ) : undefined,
                      },
                    }}
                  />
                )}
              />
            );
            break;

          case "date":
            fieldContent = (
              <Controller
                key={field.key}
                name={fieldName}
                control={control}
                defaultValue=""
                render={({ field: formField, fieldState: { error } }) => (
                  <TextField
                    {...formField}
                    type="date"
                    label={field.label}
                    required={field.required}
                    helperText={error?.message || field.hint}
                    error={Boolean(error)}
                    disabled={readOnly}
                    fullWidth
                    slotProps={{
                      inputLabel: {
                        shrink: true,
                      },
                    }}
                  />
                )}
              />
            );
            break;

          case "dropdown": {
            const options = field.options || [];
            fieldContent = (
              <Controller
                key={field.key}
                name={fieldName}
                control={control}
                defaultValue=""
                render={({ field: formField, fieldState: { error } }) => (
                  <FormControl fullWidth error={Boolean(error)} required={field.required}>
                    <InputLabel id={`label-${field.key}`}>{field.label}</InputLabel>
                    <Select
                      {...formField}
                      labelId={`label-${field.key}`}
                      label={field.label}
                      disabled={readOnly}
                    >
                      <MenuItem value="">
                        <em>None</em>
                      </MenuItem>
                      {options.map((opt) => (
                        <MenuItem key={opt} value={opt}>
                          {opt}
                        </MenuItem>
                      ))}
                    </Select>
                    {(error?.message || field.hint) && (
                      <FormHelperText>{error?.message || field.hint}</FormHelperText>
                    )}
                  </FormControl>
                )}
              />
            );
            break;
          }

          case "multiselect": {
            const options = field.options || [];
            fieldContent = (
              <Controller
                key={field.key}
                name={fieldName}
                control={control}
                defaultValue={[]}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Autocomplete
                    multiple
                    options={options}
                    value={Array.isArray(value) ? value : []}
                    onChange={(_, newValue) => onChange(newValue)}
                    disabled={readOnly}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={field.label}
                        required={field.required && (!value || value.length === 0)}
                        error={Boolean(error)}
                        helperText={error?.message || field.hint}
                      />
                    )}
                  />
                )}
              />
            );
            break;
          }

          case "checkbox":
            fieldContent = (
              <Controller
                key={field.key}
                name={fieldName}
                control={control}
                defaultValue={false}
                render={({ field: { value, onChange } }) => (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={Boolean(value)}
                        onChange={(e) => onChange(e.target.checked)}
                        disabled={readOnly}
                      />
                    }
                    label={field.label}
                  />
                )}
              />
            );
            break;

          default:
            fieldContent = null;
        }

        if (!fieldContent) return null;

        return (
          <Grid key={field.key} size={{ xs: 12, sm: isFullWidth ? 12 : 6 }}>
            {fieldContent}
          </Grid>
        );
      })}
    </Grid>
  );
};
