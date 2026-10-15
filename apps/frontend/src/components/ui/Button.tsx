import {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  forwardRef,
  isValidElement,
} from 'react';
import clsx from 'clsx';
import Icon from './Icon';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'xs' | 'sm' | 'md' | 'lg';

/**
 * Props shared between the button and anchor renderings.
 * Everything here is safe to pass to either element.
 */
interface SharedProps {
  variant?: Variant;
  size?: Size;
  /** Show a spinner and disable interaction. */
  loading?: boolean;
  /** Icon rendered before the label. */
  leftIcon?: string;
  /** Icon rendered after the label. */
  rightIcon?: string;
  /** Stretch to fill its container. */
  fullWidth?: boolean;
  /** Render only an icon — requires an accessible label. */
  iconOnly?: boolean;
  className?: string;
  children?: React.ReactNode;
  /** Native tooltip / short hint. */
  title?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  id?: string;
  style?: React.CSSProperties;
  tabIndex?: number;
  onClick?: React.MouseEventHandler<HTMLElement>;
  onFocus?: React.FocusEventHandler<HTMLElement>;
  onBlur?: React.FocusEventHandler<HTMLElement>;
}

type ButtonAsButton = SharedProps &
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    keyof SharedProps | 'disabled'
  > & {
    as?: 'button';
    disabled?: boolean;
    href?: never;
    /** Anchor-only props are not allowed when `as="button"`. */
    target?: never;
    rel?: never;
  };

type ButtonAsAnchor = SharedProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof SharedProps> & {
    as: 'a';
    href: string;
    disabled?: boolean;
    target?: string;
    rel?: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

const variantClasses: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
};

const sizeClasses: Record<Size, string> = {
  xs: 'btn-xs',
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
};

const ICON_ONLY_SIZE: Record<Size, string> = {
  xs: 'w-6 h-6 p-0',
  sm: 'w-8 h-8 p-0',
  md: 'w-10 h-10 p-0',
  lg: 'w-12 h-12 p-0',
};

const ICON_SIZE: Record<Size, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
};

const IS_DEV =
  typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;

const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  (props, ref) => {
    const {
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      iconOnly = false,
      className,
      children,
      title,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      'aria-describedby': ariaDescribedBy,
      id,
      style,
      tabIndex,
      onClick,
      onFocus,
      onBlur,
    } = props;

    const isAnchor = props.as === 'a';
    const disabled = props.disabled || loading;

    // Dev-only accessibility guard.
    if (IS_DEV && iconOnly && !ariaLabel && !ariaLabelledBy && !title) {
      // eslint-disable-next-line no-console
      console.warn(
        '[Button] iconOnly buttons must have an aria-label, aria-labelledby, or title for accessibility.',
      );
    }

    const classes = clsx(
      variantClasses[variant],
      !iconOnly && sizeClasses[size],
      iconOnly && ICON_ONLY_SIZE[size],
      fullWidth && 'w-full',
      'inline-flex items-center justify-center gap-2 whitespace-nowrap',
      'transition disabled:cursor-not-allowed disabled:opacity-50',
      loading && 'cursor-wait',
      className,
    );

    const sharedA11yProps = {
      id,
      style,
      tabIndex,
      title,
      onClick,
      onFocus,
      onBlur,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      'aria-describedby': ariaDescribedBy,
      'aria-busy': loading || undefined,
    };

    const content = (
      <>
        {loading ? (
          <Icon
            name="progress_activity"
            size={ICON_SIZE[size]}
            className="animate-spin shrink-0"
          />
        ) : leftIcon ? (
          <Icon name={leftIcon} size={ICON_SIZE[size]} className="shrink-0" />
        ) : null}
        {!iconOnly && (
          <span className="truncate">
            {isValidElement(children) || typeof children !== 'string'
              ? children
              : children}
          </span>
        )}
        {!iconOnly && rightIcon && (
          <Icon name={rightIcon} size={ICON_SIZE[size]} className="shrink-0" />
        )}
      </>
    );

    if (isAnchor) {
      // Narrow to anchor props. Because ButtonAsAnchor already omits
      // button-only props at the type level, TS now accepts this object.
      const {
        as: _as,
        disabled: _disabled,
        href,
        target,
        rel,
        download,
        ...rest
      } = props as ButtonAsAnchor;

      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          target={target}
          rel={rel}
          download={download}
          {...rest}
          {...sharedA11yProps}
          className={clsx(
            classes,
            disabled && 'pointer-events-none opacity-50',
          )}
          aria-disabled={disabled || undefined}
        >
          {content}
        </a>
      );
    }

    // Narrow to button props.
    const {
      as: _as,
      variant: _v,
      size: _s,
      loading: _l,
      leftIcon: _li,
      rightIcon: _ri,
      fullWidth: _fw,
      iconOnly: _io,
      className: _cn,
      children: _ch,
      ...rest
    } = props as ButtonAsButton;

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        {...rest}
        {...sharedA11yProps}
        className={classes}
        disabled={disabled}
      >
        {content}
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;

export type {
  ButtonProps as ButtonComponentProps,
  Variant as ButtonVariant,
  Size as ButtonSize,
};