import { load } from "./configs.ts";

export interface ReviewsRequest {
  limit: number;
  query?: string;
  sortBy?: string;
  projectId?: string;
  skip?: number;
}

export interface Resulting<T> {
  result: T;
}

export interface CompletionRate {
  completedCount: number;
  reviewersCount: number;
  hasConcern: boolean;
}

export interface ReviewList {
  reviews: Review[] | undefined;
  hasMore: boolean;
  totalCount: number;
}

export interface CurrentUserResponse {
  userId: string;
}

export interface RevisionInfo {
  projectId: string;
  revisionId: string;
  revisionCommitMessage: string;
  vcsRevisionId: string;
  tags: string[];
  parentRevisionIds: string[];
}

export interface RevisionDescriptorList {
  revision: RevisionInfo[];
}

export interface RevisionsInReviewResponse {
  allRevisions: RevisionDescriptorList;
  canSquash: boolean;
}

export interface ParticipantInReview {
  userId: string;
  state?: ParticipantState;
  role: RoleInReview;
}

export enum RoleInReview {
  Author = 1,
  Reviewer,
  Watcher,
}

export enum ParticipantState {
  Unread = 1,
  Read,
  Accepted,
  Rejected,
}

export interface Review {
  reviewId: ReviewId;
  title: string; // unused while creation!
  completionRate: CompletionRate;
  participants: ParticipantInReview[];
  createdBy: string;
  updatedAt: number;
  isUnread: boolean;
}

export interface RenameReviewRequest {
  reviewId: ReviewId;
  text: string;
}

export interface RenameReviewResponse {
  // ...
}

export type EditReviewDescriptionRequest = RenameReviewRequest;
export type EditReviewDescriptionResponse = RenameReviewResponse;

export interface ProjectId {
  projectId: string;
}
export interface ReviewId {
  projectId: string;
  reviewId: string;
}

export interface CreateReviewRequest {
  title?: string;
  projectId: string;
  revisions?: string[];
  branch?: string;
  mergeFromBranch?: string;
  mergeToBranch?: string;
}

export interface RevisionsInReview {
  reviewId: ReviewId;
  revisionId: string;
}

export interface VoidMessage {
}

export interface Err {
  error: {
    code: number;
    message: string;
  };
}

export interface VscRepo {
  id: string;
  url: string[];
}

export interface VcsRepoList {
  repo: VscRepo[];
}

export class UpsourceService {
  private myId?: string;

  constructor(private api: UpsourceApi) {
  }

  async getMyId(): Promise<string> {
    return this.myId = this.myId ??
      (await this.api.getCurrentUser()).result.userId;
  }

  async getAllMyReviews(limit = 100) {
    return this.api.getReviews({
      limit,
      query: `state: open and (reviewer: me or author: me)`,
    });
  }

  async output(reviews: Review[]) {
    const myId = await this.getMyId();
    return reviews
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .map((r) => ({
        url:
          `${this.api.host}/${r.reviewId.projectId}/review/${r.reviewId.reviewId}`,
        updatedAt: (new Date(r.updatedAt)).toLocaleString("ru-RU", {
          timeZone: "Europe/Moscow",
        }),
        myBranch: r.createdBy === myId,
        completed: r.createdBy === myId
          ? r.isUnread || !r.completionRate.hasConcern
          : r.participants.some((p) =>
            p.userId === myId && p.state && [
              ParticipantState.Accepted,
              ParticipantState.Rejected,
            ].includes(p.state)
          ),
      }));
  }

  private async getMyReviews(
    { author = false, limit = 100 },
  ): Promise<Err | Resulting<ReviewList>> {
    const me = author ? "author" : "reviewer";
    return this.api.getReviews({
      limit,
      query: `state: open and ${me}: me`,
    });
  }
}

export function createUpsourceApi() {
  const c = load<{ authorization: string; host: string }>("upsource");
  return new UpsourceApi(c.host, c.authorization);
}

// https://upsource.jetbrains.com/~api_doc/reference/Service.html#messages.UpsourceRPC
export class UpsourceApi {
  constructor(
    public host: string,
    private authorizationHeader: string,
  ) {
  }

  private static isErr<T>(e: T | Err): e is Err {
    return !!(e as unknown as Err).error;
  }

  async getReviews(dto: ReviewsRequest = { limit: 10 }) {
    return this.rpc<Resulting<ReviewList>>("getReviews", dto);
  }

  async createReview(dto: CreateReviewRequest) {
    return this.rpc<Review>("createReview", dto);
  }

  async renameReview(dto: RenameReviewRequest) {
    return this.rpc<RenameReviewResponse>("renameReview", dto);
  }

  async editReviewDescription(dto: EditReviewDescriptionRequest) {
    return this.rpc<EditReviewDescriptionResponse>(
      "editReviewDescription",
      dto,
    );
  }

  async addRevisionToReview(dto: RevisionsInReview) {
    return this.rpc<VoidMessage>("addRevisionToReview", dto);
  }

  async getCurrentUser() {
    return this.rpc<Resulting<CurrentUserResponse>>("getCurrentUser", {});
  }

  async getRevisionsInReview(dto: ReviewId) {
    return this.rpc<Resulting<RevisionsInReviewResponse>>(
      "getRevisionsInReview",
      dto,
    );
  }

  async getProjectVcsLinks(dto: ProjectId) {
    return this.rpc<Resulting<VcsRepoList>>("getProjectVcsLinks", dto);
  }

  async rpc<T>(name: string, body: object): Promise<T> {
    const response: T | Err = await (await fetch(`${this.host}/~rpc/${name}`, {
      method: "POST",
      headers: {
        authorization: this.authorizationHeader,
      },
      body: JSON.stringify(body),
    })).json();

    if (UpsourceApi.isErr(response)) {
      throw new UpsourceError(response);
    }

    return response;
  }
}

export class UpsourceError extends Error {
  static CODE_BRANCH_NOT_FOUND = 106;

  constructor(private e: Err) {
    super();
  }

  get code() {
    return this.e.error.code;
  }

  get message() {
    return `Upsource error #${this.e.error.code}: ${this.e.error.message}`;
  }
}
