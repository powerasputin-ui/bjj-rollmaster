export {};

declare global {
  namespace Express {
    interface Request {
      tournamentId: string;
      userId: string;
      athleteId: string;
      mat?: string;
    }
  }
}
