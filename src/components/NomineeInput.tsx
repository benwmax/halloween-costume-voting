import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { suggest, type Nominee } from '../lib/match'
import type { NomineeKind } from '../lib/categories'
import styles from './Ballot.module.css'

type Props = {
  id: string
  kind: NomineeKind
  value: string
  placeholder: string
  nominees: Nominee[]
  invalid: boolean
  onChange: (value: string) => void
  onPick: (nominee: Nominee) => void
}

/**
 * A ruled-line text field that suggests names other guests have already typed,
 * so later votes converge on one spelling. Free text always wins: the list
 * only helps, it never constrains. ARIA 1.2 combobox with a listbox popup.
 */
export default function NomineeInput({ id, kind, value, placeholder, nominees, invalid, onChange, onPick }: Props) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const matches = useMemo(() => suggest(nominees, kind, value), [nominees, kind, value])
  const expanded = open && matches.length > 0

  const pick = (nominee: Nominee) => {
    onPick(nominee)
    setOpen(false)
    setActive(-1)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!expanded) {
      if (event.key === 'ArrowDown' && matches.length > 0) {
        setOpen(true)
        setActive(0)
        event.preventDefault()
      }
      return
    }
    if (event.key === 'ArrowDown') {
      setActive((i) => (i + 1) % matches.length)
      event.preventDefault()
    } else if (event.key === 'ArrowUp') {
      setActive((i) => (i <= 0 ? matches.length - 1 : i - 1))
      event.preventDefault()
    } else if (event.key === 'Enter' && active >= 0) {
      pick(matches[active])
      event.preventDefault()
    } else if (event.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <div className={styles.combo}>
      <input
        id={id}
        className={styles.input}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint="next"
        maxLength={80}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      />
      <ul id={listId} role="listbox" className={styles.suggestions} hidden={!expanded}>
        {matches.map((nominee, index) => (
          <li
            key={nominee.name}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            className={`${styles.suggestion} ${index === active ? styles.suggestionActive : ''}`}
            // Keep focus in the input so blur does not close the list mid-tap.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(nominee)}
          >
            <span className={styles.suggestionName}>{nominee.name}</span>
            {nominee.costume && <span className={styles.suggestionCostume}>{nominee.costume}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
