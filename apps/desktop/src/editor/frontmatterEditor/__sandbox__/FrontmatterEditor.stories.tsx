/**
 * L3 sandbox story: lives under `__sandbox__`, tag `sandbox` in the default export.
 * Consumed when Storybook is wired to include app sandboxes.
 */
import type {FrontmatterPropertyType} from '@eskerra/core';
import {useState} from 'react';

import {FrontmatterEditor, type VaultFrontmatterIndexApi} from '../FrontmatterEditor';

const mockIndex: VaultFrontmatterIndexApi = {
  keys: ['status', 'tags', 'created'],
  inferredType: (key: string): FrontmatterPropertyType => {
    if (key === 'tags') {
      return 'tags';
    }
    if (key === 'created') {
      return 'date';
    }
    return 'text';
  },
  totalNotesWithKey: () => 3,
  valuesFor: async (key, prefix) => {
    if (key === 'status' && prefix.length === 0) {
      return [
        {value: 'draft', count: 2},
        {value: 'done', count: 1},
      ];
    }
    return [];
  },
  refreshNonce: 0,
};

export default {
  title: 'sandbox/FrontmatterEditor',
  tags: ['sandbox'],
};

export function EmptyState() {
  return (
    <div style={{maxWidth: 640, padding: 12}}>
      <FrontmatterEditor
        yamlInner={null}
        onChange={() => {}}
        index={mockIndex}
        rehydrateKey="sandbox-empty"
      />
    </div>
  );
}

export function EditableSample() {
  const [inner, setInner] = useState<string | null>('status: draft\ntags:\n  - idea');
  return (
    <div style={{maxWidth: 640, padding: 12}}>
      <FrontmatterEditor
        yamlInner={inner}
        onChange={setInner}
        index={mockIndex}
        rehydrateKey="sandbox-edit"
      />
      <pre style={{marginTop: 12, fontSize: 12, opacity: 0.75}}>{inner ?? '(null)'}</pre>
    </div>
  );
}

export function DuplicateKeysReadOnly() {
  return (
    <div style={{maxWidth: 640, padding: 12}}>
      <FrontmatterEditor
        yamlInner={'foo: 1\nfoo: 2'}
        onChange={() => {}}
        index={mockIndex}
        readOnly
        rehydrateKey="sandbox-dup"
      />
    </div>
  );
}
