type CaseThemeMode = 'light' | 'dark'

type CaseQueueTone = {
  color: string
  background: string
  border: string
}

function lightCategoryTone(category: string): CaseQueueTone {
  if (category === 'Action due') {
    return {
      color: '#9f1d12',
      background: 'rgba(191, 36, 27, 0.08)',
      border: 'rgba(191, 36, 27, 0.2)',
    }
  }

  if (category === 'Forum watch') {
    return {
      color: '#8f5d00',
      background: 'rgba(191, 125, 0, 0.08)',
      border: 'rgba(191, 125, 0, 0.18)',
    }
  }

  if (category === 'New case') {
    return {
      color: '#005f73',
      background: 'rgba(0, 118, 133, 0.08)',
      border: 'rgba(0, 118, 133, 0.18)',
    }
  }

  if (category === 'Watching') {
    return {
      color: '#0b5c58',
      background: 'rgba(0, 194, 185, 0.08)',
      border: 'rgba(0, 194, 185, 0.18)',
    }
  }

  throw new Error(`Unsupported case queue category: ${category}`)
}

function darkCategoryTone(category: string): CaseQueueTone {
  if (category === 'Action due') {
    return {
      color: '#ff8f80',
      background: 'rgba(255, 143, 128, 0.12)',
      border: 'rgba(255, 143, 128, 0.2)',
    }
  }

  if (category === 'Forum watch') {
    return {
      color: '#f3cc74',
      background: 'rgba(243, 204, 116, 0.12)',
      border: 'rgba(243, 204, 116, 0.18)',
    }
  }

  if (category === 'New case') {
    return {
      color: '#78dce8',
      background: 'rgba(120, 220, 232, 0.12)',
      border: 'rgba(120, 220, 232, 0.18)',
    }
  }

  if (category === 'Watching') {
    return {
      color: '#63ddd7',
      background: 'rgba(99, 221, 215, 0.12)',
      border: 'rgba(99, 221, 215, 0.18)',
    }
  }

  throw new Error(`Unsupported case queue category: ${category}`)
}

export function getCaseQueueCategoryTone(category: string, mode: CaseThemeMode): CaseQueueTone {
  return mode === 'dark' ? darkCategoryTone(category) : lightCategoryTone(category)
}

function lightApprovalStateTone(state: 'approval_required' | 'approved' | 'hold'): CaseQueueTone {
  if (state === 'approval_required') {
    return {
      color: '#8f5d00',
      background: 'rgba(191, 125, 0, 0.1)',
      border: 'rgba(191, 125, 0, 0.22)',
    }
  }

  if (state === 'approved') {
    return {
      color: '#0b5c58',
      background: 'rgba(0, 194, 185, 0.1)',
      border: 'rgba(0, 194, 185, 0.22)',
    }
  }

  if (state === 'hold') {
    return {
      color: '#9f1d12',
      background: 'rgba(191, 36, 27, 0.08)',
      border: 'rgba(191, 36, 27, 0.2)',
    }
  }

  throw new Error(`Unsupported case approval state: ${state}`)
}

function darkApprovalStateTone(state: 'approval_required' | 'approved' | 'hold'): CaseQueueTone {
  if (state === 'approval_required') {
    return {
      color: '#f3cc74',
      background: 'rgba(243, 204, 116, 0.14)',
      border: 'rgba(243, 204, 116, 0.22)',
    }
  }

  if (state === 'approved') {
    return {
      color: '#63ddd7',
      background: 'rgba(99, 221, 215, 0.14)',
      border: 'rgba(99, 221, 215, 0.22)',
    }
  }

  if (state === 'hold') {
    return {
      color: '#ff8f80',
      background: 'rgba(255, 143, 128, 0.12)',
      border: 'rgba(255, 143, 128, 0.22)',
    }
  }

  throw new Error(`Unsupported case approval state: ${state}`)
}

export function getCaseApprovalStateTone(
  state: 'approval_required' | 'approved' | 'hold',
  mode: CaseThemeMode,
): CaseQueueTone {
  return mode === 'dark' ? darkApprovalStateTone(state) : lightApprovalStateTone(state)
}

export function getCaseQueueActionColor(action: 'approve' | 'reject', mode: CaseThemeMode): string {
  if (action === 'approve') {
    return mode === 'dark' ? '#7ce7e0' : '#0b5c58'
  }

  return mode === 'dark' ? '#ff8f80' : '#9f1d12'
}

export function getCaseQueueBorderColor(mode: CaseThemeMode): string {
  return mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 44, 81, 0.1)'
}

export function getCaseQueueMutedTextColor(mode: CaseThemeMode): string {
  return mode === 'dark' ? 'rgba(255, 255, 255, 0.64)' : 'rgba(0, 44, 81, 0.64)'
}

export function getCaseQueueSelectedRowBackground(mode: CaseThemeMode): string {
  return mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 44, 81, 0.03)'
}
