import {
  CheckIcon,
  ChevronDownIcon,
  Cross2Icon,
  DownloadIcon,
  ExclamationTriangleIcon,
  GlobeIcon,
  ListBulletIcon,
  LockClosedIcon,
  LockOpen1Icon,
  MagnifyingGlassIcon,
  MinusIcon,
  Pencil1Icon,
  PlusIcon,
  QuestionMarkCircledIcon,
  ReloadIcon,
  TrashIcon,
  UpdateIcon,
  UploadIcon,
  ViewGridIcon,
} from '@radix-ui/react-icons'

/*
 * ExamGO's icon vocabulary: one Radix icon per repeated meaning, so the same action always looks the same.
 * Icons are decoration; the control that holds one supplies the accessible name (visible text, or an
 * aria-label for an icon-only button). The 15px artwork is not the hit target: controls stay 44px.
 */
type IconComponent = typeof PlusIcon

const ICONS = {
  add: PlusIcon,
  remove: MinusIcon,
  edit: Pencil1Icon,
  delete: TrashIcon,
  close: Cross2Icon,
  search: MagnifyingGlassIcon,
  download: DownloadIcon,
  import: UploadIcon,
  reload: ReloadIcon,
  replace: UpdateIcon,
  lock: LockClosedIcon,
  unlock: LockOpen1Icon,
  done: CheckIcon,
  warning: ExclamationTriangleIcon,
  help: QuestionMarkCircledIcon,
  expand: ChevronDownIcon,
  desk: ViewGridIcon,
  list: ListBulletIcon,
  language: GlobeIcon,
} satisfies Record<string, IconComponent>

export type IconName = keyof typeof ICONS

/** A vocabulary icon, hidden from assistive technology. */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  const Glyph = ICONS[name] as IconComponent
  return <Glyph aria-hidden="true" focusable="false" className={className ? `eg-icon ${className}` : 'eg-icon'} />
}
