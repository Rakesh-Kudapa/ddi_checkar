// TODO: drug name input with autocomplete
// - calls GET /api/autocomplete?q={query} on keystroke
// - shows dropdown of suggestions
// - on select, sets drug name in parent state

interface DrugInputProps {
  label: string
  value: string
  onChange: (val: string) => void
}

export function DrugInput({ label, value, onChange }: DrugInputProps) {
  // TODO: implement
  return <div />
}
