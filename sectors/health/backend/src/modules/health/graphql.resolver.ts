import { Resolver, Query } from "@nestjs/graphql";

/**
 * Minimal GraphQL Query root.
 *
 * The application registers GraphQL code-first (`autoSchemaFile: true`), which
 * requires at least one `@Query` root field or schema generation fails at boot
 * ("Query root type must be provided"). The health endpoints are served over
 * REST (`/health`); this resolver only exists so the schema can be generated.
 */
@Resolver()
export class GraphqlHealthResolver {
  @Query(() => String)
  health(): string {
    return "ok";
  }
}
