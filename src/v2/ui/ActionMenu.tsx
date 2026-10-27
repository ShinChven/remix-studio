import type { ReactNode } from 'react';
import { IconButton, MenuButton, MenuDivider, MenuItem, type Placement, type ButtonSize, type IconButtonVariant } from '../../m3';
import { HoverMenuButton } from './HoverMenuButton';

export interface ActionMenuItem {
  key: string;
  label: ReactNode;
  icon?: string;
  onSelect?: () => void;
  href?: string;
  target?: string;
  disabled?: boolean;
  /** Error-colored item for destructive actions. */
  danger?: boolean;
  supportingText?: ReactNode;
  /** Draws a divider before this item. */
  divider?: boolean;
  hidden?: boolean;
  checked?: boolean;
  type?: 'item' | 'checkbox' | 'radio';
  keepOpen?: boolean;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  label: string;
  icon?: string;
  placement?: Placement;
  size?: ButtonSize;
  variant?: IconButtonVariant;
  className?: string;
  /** Custom trigger instead of the overflow icon button. */
  trigger?: Parameters<typeof MenuButton>[0]['trigger'];
  /** Opens when the pointer rests on the trigger, where the device can hover. */
  openOnHover?: boolean;
}

/** Overflow menu: an icon button that opens a menu of actions. */
export function ActionMenu({ items, label, icon = 'more_vert', placement = 'bottom-end', size = 'sm', variant = 'standard', className, trigger, openOnHover }: ActionMenuProps) {
  const visible = items.filter((item) => !item.hidden);
  if (!visible.length) return null;
  const Button = openOnHover ? HoverMenuButton : MenuButton;
  return (
    <Button
      placement={placement}
      aria-label={label}
      trigger={
        (trigger as Parameters<typeof Button>[0]['trigger']) ??
        ((props) => (
          <IconButton
            {...props}
            icon={icon}
            label={label}
            size={size}
            variant={variant}
            className={className}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              props.onClick();
            }}
          />
        ))
      }
    >
      {visible.map((item) => [
        item.divider ? <MenuDivider key={`${item.key}-divider`} /> : null,
        <MenuItem
          key={item.key}
          icon={item.icon}
          disabled={item.disabled}
          onSelect={item.onSelect}
          href={item.href}
          target={item.target}
          supportingText={item.supportingText}
          className={item.danger ? 'v2-menu-danger' : undefined}
          type={item.type}
          checked={item.checked}
          keepOpen={item.keepOpen}
        >
          {item.label}
        </MenuItem>,
      ])}
    </Button>
  );
}
