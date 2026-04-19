import {
  type FrontmatterPropertyType,
  type FrontmatterValue,
  parseFrontmatterInner,
  type ParseFrontmatterInnerResult,
  addFrontmatterKey,
  deleteFrontmatterKey,
  reorderFrontmatterKeys,
  renameFrontmatterKey,
  setFrontmatterValue,
  FrontmatterEditCollisionError,
  detectValueShapeType,
  serializeFrontmatterInner,
} from '@eskerra/core';
import {
  DsButton,
  DsSurface,
  DsText,
  IconGlyph,
} from '@eskerra/ds-desktop';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Document, isMap, isScalar, YAMLMap, type ParsedNode} from 'yaml';

import {serializeFrontmatterInnerOrDropEmpty} from './frontmatterInnerSnapshot';

import './FrontmatterEditor.css';

import {INBOX_AUTOSAVE_DEBOUNCE_MS} from '../../lib/inboxAutosaveScheduler';

export type VaultFrontmatterIndexApi = {
  keys: readonly string[];
  inferredType: (key: string) => FrontmatterPropertyType;
  totalNotesWithKey: (key: string) => number;
  valuesFor: (
    key: string,
    prefix: string,
  ) => Promise<Array<{value: string | number; count: number}>>;
  refreshNonce: number;
};

type FrontmatterEditorProps = {
  yamlInner: string | null;
  onChange: (nextInner: string | null) => void;
  index: VaultFrontmatterIndexApi;
  propertyOverrides?: Record<string, {type: FrontmatterPropertyType}>;
  readOnly?: boolean;
  /** Bumps on note switch / full editor re-open so echo from the same `yamlInner` string still rehydrates. */
  rehydrateKey: string;
};

const TYPE_CHOICES: Array<{
  value: FrontmatterPropertyType;
  label: string;
}> = [
  {value: 'text', label: 'Text'},
  {value: 'number', label: 'Number'},
  {value: 'checkbox', label: 'Checkbox'},
  {value: 'date', label: 'Date'},
  {value: 'datetime', label: 'Datetime'},
  {value: 'timestamp', label: 'Timestamp'},
  {value: 'list', label: 'List'},
  {value: 'tags', label: 'Tags'},
  {value: 'object', label: 'Object'},
];

function scalarKeyString(node: ParsedNode): string {
  return isScalar(node) ? String(node.value) : String(node);
}

function topLevelKeyOrderFromDoc(doc: Document<ParsedNode>): string[] {
  const root = doc.contents;
  if (!isMap(root)) {
    return [];
  }
  const m = root as YAMLMap<ParsedNode, ParsedNode | null>;
  return m.items.map(p => scalarKeyString(p.key as ParsedNode));
}

function getValueAtPath(
  record: FrontmatterValue | null,
  path: readonly string[],
): FrontmatterValue | undefined {
  if (path.length === 0) {
    return record ?? undefined;
  }
  let cur: FrontmatterValue | null | undefined = record;
  for (const p of path) {
    if (cur == null || typeof cur !== 'object' || Array.isArray(cur)) {
      return undefined;
    }
    cur = cur[p] as FrontmatterValue;
  }
  return cur;
}

function defaultValueForType(
  t: FrontmatterPropertyType,
): FrontmatterValue {
  switch (t) {
    case 'checkbox':
      return false;
    case 'number':
      return 0;
    case 'list':
    case 'tags':
      return [];
    case 'object':
      return {};
    case 'date':
      return '';
    case 'datetime':
      return '';
    case 'timestamp':
      return '';
    default:
      return '';
  }
}

export function FrontmatterEditor({
  yamlInner,
  onChange,
  index,
  propertyOverrides,
  readOnly = false,
  rehydrateKey,
}: FrontmatterEditorProps) {
  const [workingInner, setWorkingInner] = useState(() => yamlInner ?? '');
  const lastRehydrateKeyRef = useRef(rehydrateKey);
  const lastEmittedRef = useRef<string | null | undefined>(undefined);
  const emitTimerRef = useRef<number | null>(null);

  const [localTypeOverrides, setLocalTypeOverrides] = useState<
    Record<string, FrontmatterPropertyType>
  >({});
  const [collisionError, setCollisionError] = useState<string | null>(null);
  const [addKeyDraft, setAddKeyDraft] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);

  /** Rehydrate when the parent source of truth changes (note switch / disk reload), not on echo. */
  useEffect(() => {
    if (rehydrateKey !== lastRehydrateKeyRef.current) {
      lastRehydrateKeyRef.current = rehydrateKey;
      lastEmittedRef.current = undefined;
    }
    const next = yamlInner ?? '';
    if (
      lastEmittedRef.current !== undefined &&
      next === lastEmittedRef.current
    ) {
      return;
    }
    lastEmittedRef.current = yamlInner;
    setWorkingInner(next);
    setLocalTypeOverrides({});
    setCollisionError(null);
    setAddKeyDraft('');
    setCreatingKey(false);
  }, [yamlInner, rehydrateKey]);

  useEffect(() => {
    return () => {
      if (emitTimerRef.current != null) {
        window.clearTimeout(emitTimerRef.current);
      }
    };
  }, []);

  const parsed = useMemo(
    (): ParseFrontmatterInnerResult =>
      parseFrontmatterInner(workingInner.replace(/\r\n/g, '\n')),
    [workingInner],
  );

  const duplicateKeys = parsed.duplicateKeys;
  const doc = parsed.doc;
  const record = parsed.record;

  const queueEmit = useCallback(
    (nextDoc: Document<ParsedNode>) => {
      const inner = serializeFrontmatterInnerOrDropEmpty(nextDoc);
      lastEmittedRef.current = inner;
      if (emitTimerRef.current != null) {
        window.clearTimeout(emitTimerRef.current);
      }
      emitTimerRef.current = window.setTimeout(() => {
        emitTimerRef.current = null;
        onChange(inner);
      }, INBOX_AUTOSAVE_DEBOUNCE_MS);
    },
    [onChange],
  );

  const mutateDoc = useCallback(
    (fn: (d: Document<ParsedNode>) => void) => {
      if (readOnly || duplicateKeys.length > 0) {
        return;
      }
      fn(doc);
      setWorkingInner(serializeFrontmatterInner(doc));
      queueEmit(doc);
    },
    [doc, duplicateKeys.length, queueEmit, readOnly],
  );

  const keysOrder = useMemo(() => topLevelKeyOrderFromDoc(doc), [doc]);

  const effectiveType = useCallback(
    (key: string): FrontmatterPropertyType => {
      const o = localTypeOverrides[key] ?? propertyOverrides?.[key]?.type;
      if (o) {
        return o;
      }
      if (index.keys.includes(key)) {
        return index.inferredType(key);
      }
      const v = getValueAtPath(record, [key]);
      if (v !== undefined) {
        return detectValueShapeType(v);
      }
      return 'text';
    },
    [index, localTypeOverrides, propertyOverrides, record],
  );

  const moveKey = useCallback(
    (key: string, dir: -1 | 1) => {
      const ix = keysOrder.indexOf(key);
      const j = ix + dir;
      if (ix < 0 || j < 0 || j >= keysOrder.length) {
        return;
      }
      const nextOrder = keysOrder.slice();
      const tmp = nextOrder[ix]!;
      nextOrder[ix] = nextOrder[j]!;
      nextOrder[j] = tmp;
      mutateDoc(d => {
        reorderFrontmatterKeys(d, [], nextOrder);
      });
    },
    [keysOrder, mutateDoc],
  );

  const deleteKey = useCallback(
    (key: string) => {
      mutateDoc(d => {
        deleteFrontmatterKey(d, [key]);
      });
    },
    [mutateDoc],
  );

  const renameKey = useCallback(
    (from: string, toRaw: string) => {
      const to = toRaw.trim();
      if (!to || to === from) {
        return;
      }
      mutateDoc(d => {
        try {
          renameFrontmatterKey(d, [from], to);
          setCollisionError(null);
          setLocalTypeOverrides(prev => {
            const next = {...prev};
            if (next[from]) {
              next[to] = next[from]!;
              delete next[from];
            }
            return next;
          });
        } catch (e) {
          if (e instanceof FrontmatterEditCollisionError) {
            setCollisionError(`A property named "${to}" already exists.`);
            return;
          }
          throw e;
        }
      });
    },
    [mutateDoc],
  );

  const commitAddKey = useCallback(() => {
    const raw = addKeyDraft.trim();
    if (!raw) {
      return;
    }
    mutateDoc(d => {
      try {
        const t = creatingKey ? 'text' : index.inferredType(raw);
        addFrontmatterKey(d, [], raw, defaultValueForType(t));
        setCollisionError(null);
        setAddKeyDraft('');
        setCreatingKey(false);
      } catch (e) {
        if (e instanceof FrontmatterEditCollisionError) {
          setCollisionError(`Property "${raw}" already exists.`);
          return;
        }
        throw e;
      }
    });
  }, [addKeyDraft, creatingKey, index, mutateDoc]);

  const showEmptyAffordance = yamlInner === null && !readOnly;

  if (showEmptyAffordance) {
    return (
      <div className="frontmatter-editor frontmatter-editor--add">
        <DsButton
          variant="secondary"
          type="button"
          onClick={() => {
            lastEmittedRef.current = '';
            onChange('');
          }}
        >
          + Add frontmatter
        </DsButton>
      </div>
    );
  }

  if (duplicateKeys.length > 0) {
    return (
      <DsSurface className="frontmatter-editor frontmatter-editor--duplicate">
        <DsText variant="title" className="frontmatter-editor__warn-title">
          Duplicate YAML keys
        </DsText>
        <p className="muted frontmatter-editor__warn-body">
          This note repeats top-level keys ({duplicateKeys.join(', ')}). Resolve the conflict in the
          markdown source before structured editing can continue.
        </p>
      </DsSurface>
    );
  }

  return (
    <DsSurface className="frontmatter-editor">
      <div className="frontmatter-editor__header">
        <DsText variant="title">Properties</DsText>
      </div>

      {collisionError ? (
        <p className="frontmatter-editor__collision" role="status">
          {collisionError}
        </p>
      ) : null}

      <ul className="frontmatter-editor__rows">
        {keysOrder.map(key => (
          <TopLevelPropertyRow
            key={key}
            rowKey={key}
            value={getValueAtPath(record, [key]) ?? null}
            propType={effectiveType(key)}
            readOnly={readOnly}
            index={index}
            onRename={renameKey}
            onDelete={() => deleteKey(key)}
            onMoveUp={() => moveKey(key, -1)}
            onMoveDown={() => moveKey(key, 1)}
            canMoveUp={keysOrder.indexOf(key) > 0}
            canMoveDown={keysOrder.indexOf(key) < keysOrder.length - 1}
            onChangeValue={nextVal => {
              mutateDoc(d => {
                setFrontmatterValue(d, [key], nextVal);
              });
            }}
            onChangeType={t => {
              setLocalTypeOverrides(prev => ({...prev, [key]: t}));
              mutateDoc(d => {
                setFrontmatterValue(d, [key], defaultValueForType(t));
              });
            }}
          />
        ))}
      </ul>

      {!readOnly ? (
        <div className="frontmatter-editor__footer">
          <input
            className="frontmatter-editor__add-input"
            aria-label="Property name"
            placeholder="Add property…"
            value={addKeyDraft}
            onChange={e => setAddKeyDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitAddKey();
              }
            }}
            list="frontmatter-known-keys"
          />
          <datalist id="frontmatter-known-keys">
            {index.keys.map(k => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <label className="frontmatter-editor__create-inline">
            <input
              type="checkbox"
              checked={creatingKey}
              onChange={e => setCreatingKey(e.target.checked)}
            />{' '}
            New key
          </label>
          <DsButton variant="secondary" type="button" onClick={commitAddKey}>
            Add
          </DsButton>
        </div>
      ) : null}
    </DsSurface>
  );
}

type RowProps = {
  rowKey: string;
  value: FrontmatterValue | null;
  propType: FrontmatterPropertyType;
  readOnly: boolean;
  index: VaultFrontmatterIndexApi;
  onRename: (from: string, to: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChangeValue: (v: FrontmatterValue) => void;
  onChangeType: (t: FrontmatterPropertyType) => void;
};

function TopLevelPropertyRow({
  rowKey,
  value,
  propType,
  readOnly,
  index,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onChangeValue,
  onChangeType,
}: RowProps) {
  const [nameDraft, setNameDraft] = useState(rowKey);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<
    Array<{value: string | number; count: number}>
  >([]);
  const [textPrefix, setTextPrefix] = useState('');
  const suggestKind: 'none' | 'scalar' =
    propType === 'text' ||
    propType === 'number' ||
    propType === 'list' ||
    propType === 'tags'
      ? 'scalar'
      : 'none';

  useEffect(() => {
    setNameDraft(rowKey);
  }, [rowKey]);

  useEffect(() => {
    let cancelled = false;
    if (!suggestOpen || suggestKind === 'none') {
      return;
    }
    void (async () => {
      const rows = await index.valuesFor(rowKey, textPrefix);
      if (!cancelled) {
        setSuggestions(rows);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [index, rowKey, suggestKind, suggestOpen, textPrefix, index.refreshNonce]);

  const applyRename = () => {
    if (nameDraft.trim() !== rowKey) {
      onRename(rowKey, nameDraft);
    }
  };

  return (
    <li className="frontmatter-editor__row">
      <div className="frontmatter-editor__row-chrome">
        <button
          type="button"
          className="frontmatter-editor__move"
          aria-label="Move property up"
          disabled={readOnly || !canMoveUp}
          onClick={onMoveUp}
        >
          <IconGlyph name="expand_less" size={12} />
        </button>
        <button
          type="button"
          className="frontmatter-editor__move"
          aria-label="Move property down"
          disabled={readOnly || !canMoveDown}
          onClick={onMoveDown}
        >
          <IconGlyph name="expand_more" size={12} />
        </button>
      </div>
      <input
        className="frontmatter-editor__key-input"
        value={nameDraft}
        disabled={readOnly}
        aria-label="Property name"
        onChange={e => setNameDraft(e.target.value)}
        onBlur={applyRename}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            applyRename();
          }
        }}
      />
      <select
        className="frontmatter-editor__type-select"
        aria-label="Property type"
        disabled={readOnly}
        value={propType}
        onChange={e =>
          onChangeType(e.target.value as FrontmatterPropertyType)
        }
      >
        {TYPE_CHOICES.map(c => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <div className="frontmatter-editor__value">
        <PropertyValueControl
          propType={propType}
          value={value}
          readOnly={readOnly}
          onChange={onChangeValue}
          onSuggestPrefix={setTextPrefix}
          onSuggestOpenChange={setSuggestOpen}
        />
        {suggestOpen && suggestions.length > 0 && suggestKind !== 'none' ? (
          <ul className="frontmatter-editor__suggest" role="listbox">
            {suggestions.slice(0, 12).map((s, i) => (
              <li key={`${String(s.value)}-${i}`}>
                <button
                  type="button"
                  className="frontmatter-editor__suggest-row"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    if (propType === 'number' && typeof s.value === 'number') {
                      onChangeValue(s.value);
                    } else {
                      onChangeValue(String(s.value));
                    }
                    setSuggestOpen(false);
                  }}
                >
                  <span>{String(s.value)}</span>
                  <span className="muted">{s.count}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <button
        type="button"
        className="frontmatter-editor__delete"
        aria-label={`Delete ${rowKey}`}
        disabled={readOnly}
        onClick={onDelete}
      >
        <IconGlyph name="delete" size={12} />
      </button>
    </li>
  );
}

type ControlProps = {
  propType: FrontmatterPropertyType;
  value: FrontmatterValue | null;
  readOnly: boolean;
  onChange: (v: FrontmatterValue) => void;
  onSuggestPrefix: (prefix: string) => void;
  onSuggestOpenChange: (open: boolean) => void;
};

function PropertyValueControl({
  propType,
  value,
  readOnly,
  onChange,
  onSuggestPrefix,
  onSuggestOpenChange,
}: ControlProps) {
  switch (propType) {
    case 'checkbox': {
      const checked = Boolean(value);
      return (
        <label className="frontmatter-editor__checkbox">
          <input
            type="checkbox"
            checked={checked}
            disabled={readOnly}
            onChange={e => onChange(e.target.checked)}
          />
        </label>
      );
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      return (
        <input
          type="number"
          className="frontmatter-editor__scalar-input"
          disabled={readOnly}
          value={Number.isFinite(n) ? n : 0}
          onChange={e => {
            onChange(Number(e.target.value));
            onSuggestPrefix(e.currentTarget.value.trim());
          }}
          onFocus={() => onSuggestOpenChange(true)}
          onBlur={() => onSuggestOpenChange(false)}
        />
      );
    }
    case 'date': {
      const s = typeof value === 'string' ? value : '';
      return (
        <input
          type="date"
          className="frontmatter-editor__scalar-input"
          disabled={readOnly}
          value={s}
          onChange={e => onChange(e.target.value)}
        />
      );
    }
    case 'datetime': {
      const s = typeof value === 'string' ? value : '';
      return (
        <input
          type="datetime-local"
          className="frontmatter-editor__scalar-input"
          disabled={readOnly}
          value={s}
          onChange={e => onChange(e.target.value)}
        />
      );
    }
    case 'timestamp': {
      if (typeof value === 'number') {
        return (
          <input
            type="number"
            className="frontmatter-editor__scalar-input"
            disabled={readOnly}
            value={value}
            onChange={e => onChange(Number(e.target.value))}
          />
        );
      }
      const s = typeof value === 'string' ? value : '';
      return (
        <input
          type="text"
          className="frontmatter-editor__scalar-input"
          disabled={readOnly}
          placeholder="ISO-8601 instant"
          value={s}
          onChange={e => onChange(e.target.value)}
        />
      );
    }
    case 'list':
    case 'tags': {
      const arr = Array.isArray(value)
        ? value.map(v => String(v))
        : value == null
          ? []
          : [String(value)];
      return (
        <ListTagsEditor
          asTags={propType === 'tags'}
          items={arr}
          readOnly={readOnly}
          onChange={onChange}
          onSuggestPrefix={onSuggestPrefix}
          onSuggestOpenChange={onSuggestOpenChange}
        />
      );
    }
    case 'object': {
      if (value != null && typeof value === 'object' && !Array.isArray(value)) {
        return (
          <ObjectJsonEditor
            obj={value as {[k: string]: FrontmatterValue}}
            readOnly={readOnly}
            onChange={onChange}
          />
        );
      }
      return (
        <span className="muted">Invalid object — edit in source</span>
      );
    }
    default: {
      const s =
        value === null || value === undefined
          ? ''
          : typeof value === 'string'
            ? value
            : JSON.stringify(value);
      return (
        <input
          type="text"
          className="frontmatter-editor__scalar-input"
          disabled={readOnly}
          value={s}
          onChange={e => {
            onChange(e.target.value);
            onSuggestPrefix(e.currentTarget.value.trim());
          }}
          onFocus={() => onSuggestOpenChange(true)}
          onBlur={() => onSuggestOpenChange(false)}
        />
      );
    }
  }
}

function ListTagsEditor({
  asTags,
  items,
  readOnly,
  onChange,
  onSuggestPrefix,
  onSuggestOpenChange,
}: {
  asTags: boolean;
  items: string[];
  readOnly: boolean;
  onChange: (v: FrontmatterValue) => void;
  onSuggestPrefix: (prefix: string) => void;
  onSuggestOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState('');
  const commitDraft = () => {
    const t = draft.trim();
    if (!t) {
      return;
    }
    const next = asTags ? [...items, t.replace(/^#+/, '')] : [...items, t];
    onChange(next);
    setDraft('');
  };
  return (
    <div className="frontmatter-editor__list">
      <ul>
        {items.map((it, i) => (
          <li key={`${it}-${i}`}>
            <span className="frontmatter-editor__pill">
              {asTags ? `#${it}` : it}
              {!readOnly ? (
                <button
                  type="button"
                  className="frontmatter-editor__pill-x"
                  aria-label="Remove item"
                  onClick={() =>
                    onChange(items.filter((_, j) => j !== i))
                  }
                >
                  ×
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {!readOnly ? (
        <input
          className="frontmatter-editor__scalar-input"
          placeholder={asTags ? 'Add tag…' : 'Add item…'}
          value={draft}
          onChange={e => {
            setDraft(e.target.value);
            onSuggestPrefix(e.target.value.trim());
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitDraft();
            }
          }}
          onFocus={() => onSuggestOpenChange(true)}
          onBlur={() => {
            onSuggestOpenChange(false);
            commitDraft();
          }}
        />
      ) : null}
    </div>
  );
}

function ObjectJsonEditor({
  obj,
  readOnly,
  onChange,
}: {
  obj: {[k: string]: FrontmatterValue};
  readOnly: boolean;
  onChange: (v: FrontmatterValue) => void;
}) {
  const text = useMemo(
    () => JSON.stringify(obj, null, 2),
    [obj],
  );
  return (
    <textarea
      className="frontmatter-editor__object-json"
      disabled={readOnly}
      rows={Math.min(12, 2 + text.split('\n').length)}
      value={text}
      onChange={e => {
        try {
          const parsed = JSON.parse(e.target.value) as unknown;
          if (
            parsed != null &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed)
          ) {
            onChange(parsed as {[k: string]: FrontmatterValue});
          }
        } catch {
          /* keep editing */
        }
      }}
    />
  );
}
