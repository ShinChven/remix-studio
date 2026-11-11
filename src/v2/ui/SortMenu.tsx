import { ActionMenu } from './ActionMenu';

export interface SortOption<T extends string> {
  value: T;
  label: string;
  icon?: string;
}

/** The order of a list, as a menu behind one icon button. */
export function SortMenu<T extends string>({ value, options, onChange, label }: { value: T; options: SortOption<T>[]; onChange: (value: T) => void; label: string }) {
  return <ActionMenu label={label} icon="sort" openOnHover items={options.map((option) => ({ key: option.value, type: 'radio' as const, checked: option.value === value, icon: option.icon, label: option.label, onSelect: () => onChange(option.value) }))} />;
}
