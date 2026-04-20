import type {FrontmatterPropertyType} from './frontmatterTypes';

/** Settings override wins when present; otherwise use vault-inferred type. */
export function resolveEffectiveFrontmatterPropertyType(args: {
  override?: FrontmatterPropertyType | undefined;
  inferredFromVault: FrontmatterPropertyType;
}): FrontmatterPropertyType {
  return args.override ?? args.inferredFromVault;
}
