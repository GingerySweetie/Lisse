import { useState } from 'react';

interface Props {
  choices: string[];
  /** When true, the buttons can be clicked (no user reply yet after this message). */
  clickable: boolean;
  onSelect: (choice: string) => void;
}

export default function ChoicesWidget({ choices, clickable, onSelect }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  function handleClick(choice: string) {
    if (!clickable || selected !== null) return;
    setSelected(choice);
    onSelect(choice);
  }

  return (
    <div className="choices-widget">
      {choices.map((c) => (
        <button
          key={c}
          type="button"
          disabled={!clickable || selected !== null}
          onClick={() => handleClick(c)}
          className={`choices-btn${selected === c ? ' is-selected' : ''}${!clickable ? ' is-past' : ''}`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
