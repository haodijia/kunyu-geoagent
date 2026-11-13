/** Native browser events with the element bound by the listener. */
type Targeted<E, T> = Omit<E, "currentTarget" | "target"> & {
  currentTarget: T;
  target: EventTarget & T;
};
export type MouseEvent<T = HTMLElement> = Targeted<globalThis.MouseEvent, T>;
export type PointerEvent<T = HTMLElement> = Targeted<
  globalThis.PointerEvent,
  T
>;
export type KeyboardEvent<T = HTMLElement> = Targeted<
  globalThis.KeyboardEvent,
  T
>;
export type ChangeEvent<T = HTMLInputElement> = Targeted<Event, T>;
export type FormEvent<T = HTMLFormElement> = Targeted<SubmitEvent, T>;
export type ClipboardEvent<T = HTMLElement> = Targeted<
  globalThis.ClipboardEvent,
  T
>;
export type DragEvent<T = HTMLElement> = Targeted<globalThis.DragEvent, T>;
export type FocusEvent<T = HTMLElement> = Targeted<globalThis.FocusEvent, T>;
export type WheelEvent<T = HTMLElement> = Targeted<globalThis.WheelEvent, T>;
export type SetStateAction<T> = T | ((value: T) => T);
export type Dispatch<T> = (value: T) => void;
