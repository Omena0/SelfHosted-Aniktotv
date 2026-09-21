declare module '@tanstack/react-virtual' {
  import type { Virtualizer, VirtualizerOptions, PartialKeys } from '@tanstack/virtual-core';

  export type ReactVirtualizer<TScrollElement extends Element | Window, TItemElement extends Element> = Virtualizer<TScrollElement, TItemElement> & {
    containerRef: (node: HTMLElement | null) => void;
  };

  export type ReactVirtualizerOptions<TScrollElement extends Element | Window, TItemElement extends Element> = VirtualizerOptions<TScrollElement, TItemElement> & {
    useFlushSync?: boolean;
    directDomUpdates?: boolean;
    directDomUpdatesMode?: 'position' | 'transform';
  };

  export declare function useVirtualizer<TScrollElement extends Element, TItemElement extends Element>(
    options: PartialKeys<ReactVirtualizerOptions<TScrollElement, TItemElement>, 'observeElementRect' | 'observeElementOffset' | 'scrollToFn'>
  ): ReactVirtualizer<TScrollElement, TItemElement>;

  export declare function useWindowVirtualizer<TItemElement extends Element>(
    options: PartialKeys<ReactVirtualizerOptions<Window, TItemElement>, 'getScrollElement' | 'observeElementRect' | 'observeElementOffset' | 'scrollToFn'>
  ): ReactVirtualizer<Window, TItemElement>;

  export * from '@tanstack/virtual-core';
}