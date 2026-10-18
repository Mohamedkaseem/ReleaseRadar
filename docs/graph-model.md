# Graph model and essential Cypher

Each content snapshot contains Entity nodes additionally labeled Service, Endpoint, Field, Workflow, Test, Team, or Source. Every entity has an ID, kind, name, metadata JSON, and optional source ID. Source metadata preserves path, line, excerpt, revision, and content hash.

Relations: OWNS (Team → Service), EXPOSES (Service → Endpoint), RETURNS (Endpoint → Field), CONSUMES (Service → Field), CALLS (Service → Endpoint), DEPENDS_ON (caller Service → provider Service), USES (Workflow → Service), VERIFIES (Test → Workflow).

## Direct and indirect field consumers

```cypher
MATCH (consumer:Service)-[:CONSUMES]->(changed:Entity {id:$id})
MATCH p=(downstream:Service)-[:DEPENDS_ON*0..4]->(consumer)
RETURN downstream.id AS id,
       downstream.name AS name,
       [n IN nodes(p) | n.id] AS pathIds,
       [r IN relationships(p) | r.sourceId] AS sourceIds,
       consumer.sourceId AS consumerSource
LIMIT 101
```

The application reverses returned service paths for the impact explanation. Endpoint removals use CALLS instead of CONSUMES. The extra row detects path truncation; an exact-depth-five query detects deeper dependencies. Results are potential impact until tested.

## Relevant workflow checks

```cypher
MATCH (w:Workflow)-[:USES]->(s:Service {id:$id})
RETURN w.id AS id
```

```cypher
MATCH (t:Test)-[:VERIFIES]->(w:Workflow)
WHERE w.id IN $ids
RETURN t.metadata AS metadata
```

## Immutable evidence and history

Snapshot metadata retains the manifest and content hash. Investigations store baselineGraph and candidateGraph references. Reopening an investigation reads nodes, edges, and source metadata from those original graphs.

```cypher
MATCH (a:Entity)-[r]->(b:Entity)
RETURN r.id AS id,a.id AS source,b.id AS target,
       type(r) AS kind,r.sourceId AS sourceId
```

```cypher
MERGE (r:Investigation {id:$id})
SET r.json=$json,r.updatedAt=$updatedAt,r.status=$status
RETURN r.id AS id
```

Reports are persisted as validated application documents on Investigation nodes; detailed dependency relationships remain native graph edges. This version does not model every report event as a separate graph node.
