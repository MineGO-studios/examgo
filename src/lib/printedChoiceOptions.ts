/** Recognize a source's embedded choice list without changing its wording. */
export function hasPrintedChoiceOptions(prompt: string, options: readonly { text: string }[]): boolean {
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ')
  return [...prompt.matchAll(/\(([^()]*)\)/g)].some((match) => {
    const printed = match[1].split(/\s*[/_]\s*/).map(normalize)
    return printed.length === options.length &&
      printed.every((text, index) => text === normalize(options[index].text))
  })
}
