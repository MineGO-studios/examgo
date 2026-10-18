import { normalizeCatalogueQuestion } from './catalogueNormalization'
import type { CataloguePromotionPlan } from './cataloguePromotion'
import type { StagedInterchangeQuestion } from './questionInterchange'
import { questionInputPayload } from './questions'
import { readableImportIssue } from './importReadable'

export function importReviewMessage(cause: string) {
  const field = /group|passage|attempt|count/i.test(cause) ? 'group/context'
    : /lesson/i.test(cause) ? 'lesson' : /prompt/i.test(cause) ? 'question'
      : /option|choice|label/i.test(cause) ? 'options/answer' : 'content/answer'
  const status = /unsupported|not supported|structured.*review|rendering requires/i.test(cause)
    ? 'unsupported' : /missing|unmapped|incomplete/i.test(cause) ? 'missing' : 'uncertain'
  const remedy = field === 'group/context'
    ? 'Confirm the full original group, passage, displayed points and attempt rule before retrying.'
    : field === 'lesson' ? 'Supply or map the lesson, then preview again.'
      : field === 'question' ? 'Supply the complete question text, then preview again.'
        : 'Check the original options and answer against the supported type; correct the source or mapping and preview again.'
  const incompleteGroup = cause.match(/^(.*?: )?Source group is incomplete\.$/)
  if (incompleteGroup || /^[a-z]+(-[a-z]+)+$/.test(cause)) {
    const readable = readableImportIssue(incompleteGroup ? 'group-incomplete' : cause)
    return { field, status, cause: `${incompleteGroup?.[1] ?? ''}${readable.problem}`, remedy: readable.remedy }
  }
  return { field, status, cause, remedy }
}

/** Uses the same conversion as commit; a ready item can still be held by its group. */
export function reviewImportQuestion(question: StagedInterchangeQuestion, bankId: string,
  plan?: CataloguePromotionPlan) {
  const conversion = normalizeCatalogueQuestion(question, bankId)
  const component = plan?.components.find((entry) => entry.catalogueIds.includes(question.catalogueId))
  const causes = [...question.issues.filter((issue) => issue !== 'selection-marks-unassigned'),
    ...(conversion.status === 'review' ? [conversion.reason] : []),
    ...(component?.status === 'review' ? component.issues.map((issue) => issue.sourceId === question.catalogueId
      ? issue.message : `${issue.sourceId}: ${issue.message}`) : [])]
  const payload = conversion.status === 'ready' ? questionInputPayload(conversion.input) : null
  const messages = causes.map(importReviewMessage)
  return {
    original: question.sourceFields,
    question: conversion.status === 'ready' ? conversion.input.prompt : question.prompt,
    content: payload?.content ?? question.content,
    answer: payload?.answer ?? question.answer,
    interpreted: conversion.status === 'ready',
    heldForReview: conversion.status === 'review' || component?.status === 'review',
    messages: messages.filter((message, index) => messages.findIndex(other => other.cause === message.cause && other.remedy === message.remedy) === index),
  }
}

export function importOutcomeTotals(readyRows: number, reviewRows: number, unchanged = 0) {
  return { added: readyRows - unchanged, updated: 0, unchanged, duplicate: 0, rejected: 0, review: reviewRows }
}
