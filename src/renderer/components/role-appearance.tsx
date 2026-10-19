import { useRef, useState } from 'react';
import { Pipette } from 'lucide-react';
import type { Role } from '../../shared/community';
import { Avatar } from './avatar';

export const roleColours = [
  null,
  '#ef404c',
  '#ff9e27',
  '#f4c82f',
  '#2bb467',
  '#5144f6',
  '#ed4081',
  '#922be0',
  '#299bb3',
] as const;
export function RoleColourPicker({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  onChange(value: string | null): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [custom, setCustom] = useState(false);
  return (
    <div className="role-colour-options" role="group" aria-label="Role colour">
      {roleColours.map((colour) => (
        <button
          type="button"
          key={colour ?? 'default'}
          className="role-colour-swatch"
          aria-label={colour ? `Role colour: ${colour}` : 'Default role colour'}
          aria-pressed={value === colour}
          disabled={disabled}
          style={{ backgroundColor: colour ?? '#a3a9b5' }}
          onClick={() => onChange(colour)}
        />
      ))}
      <button
        type="button"
        className="role-custom-colour"
        aria-label="Choose a custom role colour"
        disabled={disabled}
        onClick={() => {
          setCustom(true);
          input.current?.click();
        }}
      >
        <Pipette size={17} />
      </button>
      <input
        ref={input}
        type="color"
        aria-label="Custom role colour"
        className={custom ? 'role-native-colour' : 'sr-only'}
        value={value ?? '#a3a9b5'}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
export function RolePortrait({
  role,
  localUrl,
  large = false,
}: {
  role: Pick<Role, 'name' | 'colour' | 'iconId'>;
  localUrl?: string;
  large?: boolean;
}) {
  if (localUrl) return <img className={`role-portrait ${large ? 'is-large' : ''}`} src={localUrl} alt="" />;
  return (
    <Avatar
      name={role.name}
      imageId={role.iconId}
      accent={role.colour ?? undefined}
      className={`role-portrait ${large ? 'is-large' : ''}`}
    />
  );
}
export function RoleMark({ role }: { role: Pick<Role, 'name' | 'colour' | 'iconId'> }) {
  return role.iconId ? (
    <Avatar name={role.name} imageId={role.iconId} className="role-icon-mark" />
  ) : (
    <span
      className="role-colour-dot"
      style={{ backgroundColor: role.colour ?? '#9aa3a9' }}
      aria-hidden="true"
    />
  );
}
