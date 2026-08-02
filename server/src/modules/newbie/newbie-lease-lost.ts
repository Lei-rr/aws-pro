export class NewbieTaskLeaseLostException extends Error {
  constructor() {
    super('Newbie task worker lease lost')
    this.name = 'NewbieTaskLeaseLostException'
  }
}
