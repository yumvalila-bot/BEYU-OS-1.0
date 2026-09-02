import { Injectable } from "@nestjs/common";
import { SearchRepository } from "./search.repository";
@Injectable()
export class SearchService {
  constructor(private readonly repo: SearchRepository) {}
  search(q: string, limit = 20) {
    return this.repo.globalSearch(q, Math.min(limit, 100));
  }
}
