
export class NewbieTaskCancelledException extends Error {
  constructor(message = 'task cancelled') {
    super(message)
    this.name = 'NewbieTaskCancelledException'
  }
}
