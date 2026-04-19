import {
  type FrontmatterPropertyType,
  type EskerraSettings,
} from '@eskerra/core';
import {useVaultFrontmatterIndex} from '../../hooks/useVaultFrontmatterIndex';
import {writeVaultSettings} from '../../lib/vaultBootstrap';

const TYPE_OPTIONS: Array<{value: FrontmatterPropertyType | ''; label: string}> = [
  {value: '', label: 'Default (inferred)'},
  {value: 'text', label: 'Text'},
  {value: 'number', label: 'Number'},
  {value: 'checkbox', label: 'Checkbox'},
  {value: 'date', label: 'Date'},
  {value: 'datetime', label: 'Datetime'},
  {value: 'timestamp', label: 'Timestamp'},
  {value: 'url', label: 'URL'},
  {value: 'list', label: 'List'},
  {value: 'tags', label: 'Tags'},
  {value: 'object', label: 'Object'},
];

type PropertiesTabProps = {
  vaultRoot: string;
  fs: import('@eskerra/core').VaultFilesystem;
  vaultSettings: EskerraSettings;
  setVaultSettings: React.Dispatch<
    React.SetStateAction<EskerraSettings | null>
  >;
};

export function PropertiesTab({
  vaultRoot,
  fs,
  vaultSettings,
  setVaultSettings,
}: PropertiesTabProps) {
  const fm = useVaultFrontmatterIndex({
    vaultRoot,
    overrides: vaultSettings.frontmatterProperties,
  });

  const setOverride = async (
    key: string,
    type: FrontmatterPropertyType | '',
  ) => {
    const next: EskerraSettings = {...vaultSettings};
    const fp = {...(next.frontmatterProperties ?? {})};
    if (type === '') {
      delete fp[key];
    } else {
      fp[key] = {type};
    }
    next.frontmatterProperties =
      Object.keys(fp).length > 0 ? fp : undefined;
    await writeVaultSettings(vaultRoot, fs, next);
    setVaultSettings(next);
  };

  const rows = fm.snapshot?.keys ?? [];

  return (
    <div className="properties-tab">
      <p className="muted properties-tab-lead">
        Override inferred property types for vault frontmatter keys. Defaults use
        the vault-wide statistical model (requires a few samples per key).
      </p>
      {fm.skippedDuplicateKeyFiles > 0 ? (
        <p className="info-banner" role="status">
          {fm.skippedDuplicateKeyFiles} file
          {fm.skippedDuplicateKeyFiles === 1 ? '' : 's'} skipped in the index
          because of duplicate top-level YAML keys (not included in autocomplete).
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="muted">No frontmatter keys discovered yet.</p>
      ) : (
        <table className="properties-tab-table">
          <thead>
            <tr>
              <th scope="col">Property</th>
              <th scope="col">Inferred</th>
              <th scope="col">Notes</th>
              <th scope="col">Override</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const ov = vaultSettings.frontmatterProperties?.[row.key]?.type;
              const sel = ov ?? '';
              return (
                <tr key={row.key}>
                  <td>{row.key}</td>
                  <td className="muted">{row.inferredType}</td>
                  <td>{row.totalNotes}</td>
                  <td>
                    <select
                      aria-label={`Type override for ${row.key}`}
                      value={sel}
                      onChange={e => {
                        const v = e.target.value as
                          | FrontmatterPropertyType
                          | '';
                        void setOverride(row.key, v);
                      }}>
                      {TYPE_OPTIONS.map(o => (
                        <option key={o.label} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
