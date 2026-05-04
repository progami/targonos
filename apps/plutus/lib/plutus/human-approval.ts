export const HUMAN_APPROVAL_HEADER = 'x-human-approval';
export const HUMAN_APPROVAL_PHRASE = 'HUMAN APPROVED';

export class HumanApprovalError extends Error {
  status = 403;

  constructor(action: string) {
    super(`${action} requires ${HUMAN_APPROVAL_HEADER}: ${HUMAN_APPROVAL_PHRASE}`);
    this.name = 'HumanApprovalError';
  }
}

export function requireHumanApprovalHeader(req: Request, action: string): void {
  const approval = req.headers.get(HUMAN_APPROVAL_HEADER);
  if (approval !== HUMAN_APPROVAL_PHRASE) {
    throw new HumanApprovalError(action);
  }
}
