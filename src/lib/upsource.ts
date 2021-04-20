import { loadDefault } from "./configs.ts";

interface ReviewsRequest {
  limit: number;
  query?: string;
  sortBy?: string;
  projectId?: string;
  skip?: number;
}

interface Resulting<T> {
  result: T;
}

interface CompletionRate {
  completedCount: number;
  reviewersCount: number;
  hasConcern: boolean;
}

interface ReviewList {
  reviews: ReviewDescriptor[] | undefined;
  hasMore: boolean;
  totalCount: number;
}

interface CurrentUserResponse {
  userId: string;
}

interface RevisionInfo {
  projectId: string;
  revisionId: string;
  revisionCommitMessage: string;
  vcsRevisionId: string;
  tags: string[];
  parentRevisionIds: string[];
}

interface RevisionDescriptorList {
  revision: RevisionInfo[];
}
interface RevisionsInReviewResponse {
  allRevisions: RevisionDescriptorList;
  canSquash: boolean;
}

interface ParticipantInReview {
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

export interface ReviewDescriptor {
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

interface ReviewId {
  projectId: string;
  reviewId: string;
}

interface CreateReviewRequest {
  title?: string;
  projectId: string;
  revisions?: string[];
  branch?: string;
  mergeFromBranch?: string;
  mergeToBranch?: string;
}

interface RevisionsInReview {
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

export class UpsourceService {
  constructor(private api: UpsourceApi) {
  }

  async getMyId(): Promise<string> {
    return (await this.api.getCurrentUser()).result.userId;
  }

  async getAllMyReviews(limit = 100) {
    return this.api.getReviews({
      limit,
      query: `state: open and (reviewer: me or author: me)`,
    });
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
  const { authorization, host } = loadDefault("upsource") as any;
  return new UpsourceApi(host, authorization);
}

// https://upsource.jetbrains.com/~api_doc/reference/Service.html#messages.UpsourceRPC
export class UpsourceApi {
  constructor(
    private host: string,
    private authorizationHeader: string,
  ) {
  }

  getReviews = async (dto: ReviewsRequest = { limit: 10 }) =>
    this.rpc<Resulting<ReviewList>>("getReviews", dto);
  createReview = async (dto: CreateReviewRequest) =>
    this.rpc<ReviewDescriptor>("createReview", dto);
  renameReview = async (dto: RenameReviewRequest) =>
    this.rpc<RenameReviewResponse>("renameReview", dto);
  editReviewDescription = async (dto: EditReviewDescriptionRequest) =>
    this.rpc<EditReviewDescriptionResponse>("editReviewDescription", dto);
  addRevisionToReview = async (dto: RevisionsInReview) =>
    this.rpc<VoidMessage>("addRevisionToReview", dto);
  getCurrentUser = async () =>
    this.rpc<Resulting<CurrentUserResponse>>("getCurrentUser", {});
  getRevisionsInReview = async (dto: ReviewId) =>
    this.rpc<Resulting<RevisionsInReviewResponse>>("getCurrentUser", {});

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

  private static isErr<T>(e: T | Err): e is Err {
    return !!(e as unknown as Err).error;
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
    return `Upsource error: ${this.e.error.code} ${this.e.error.message}`;
  }
}
