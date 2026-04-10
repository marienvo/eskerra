import {
  type CSSProperties,
  type ForwardedRef,
  type ReactNode,
  forwardRef,
} from 'react';

export type FileTreeProps = {
  /** Total scrollable height of virtualized content (px). */
  totalHeightPx: number;
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  innerStyle?: CSSProperties;
};

/**
 * Scroll container + inner positioning slot for virtualized or static file lists.
 * Works with `@tanstack/react-virtual` by passing the same `ref` as `getScrollElement`.
 */
export const FileTree = forwardRef(function FileTree(
  {
    totalHeightPx,
    children,
    className,
    innerClassName,
    innerStyle,
  }: FileTreeProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  return (
    <div ref={ref} className={className}>
      <div
        className={innerClassName}
        style={{height: `${totalHeightPx}px`, position: 'relative', ...innerStyle}}
      >
        {children}
      </div>
    </div>
  );
});
