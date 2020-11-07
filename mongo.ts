import {
  Collection,
  CollectionInsertManyOptions,
  CommonOptions,
  Db,
  FilterQuery,
  FindOneOptions,
  MongoClient,
  MongoError,
  OptionalId,
} from "mongodb";
import * as TE from "fp-ts/TaskEither";
import * as RA from "fp-ts/lib/ReadonlyArray";
import * as RNEA from "fp-ts/lib/ReadonlyNonEmptyArray";
import { Branded } from "io-ts";
import { pipe } from "fp-ts/lib/pipeable";

type NonConnectedMongoClient = Branded<MongoClient, "nonconnected">;
type ConnectedMongoClient = Branded<MongoClient, "connected">;

export const client = (uri: string) =>
  new MongoClient(uri, {
    useNewUrlParser: true,
    connectTimeoutMS: 1000 * 10,
    useUnifiedTopology: true,
  }) as NonConnectedMongoClient;

export const connect = (
  client: NonConnectedMongoClient
): TE.TaskEither<MongoError, ConnectedMongoClient> =>
  TE.tryCatch(
    () => client.connect() as Promise<ConnectedMongoClient>,
    (err: MongoError) => err
  );

export const db = (name: string) => (client: ConnectedMongoClient): Db =>
  client.db(name);

export const collection = <A>(name: string) => (db: Db) =>
  db.collection<A>(name);

export const close = (
  client: ConnectedMongoClient
): TE.TaskEither<MongoError, void> =>
  TE.tryCatch(
    () => client.close(),
    (err: MongoError) => err
  );

export const useMongo = (uri: string) => <A>(
  use: (a: ConnectedMongoClient) => TE.TaskEither<Error, A>
): TE.TaskEither<Error, A> =>
  TE.bracket(pipe(uri, client, connect), use, (client) => close(client));

export const find = <A>(
  q: FilterQuery<A>,
  o?: FindOneOptions<A extends A ? A : A>
) => (c: Collection<A>): TE.TaskEither<MongoError, A[]> =>
  TE.tryCatch(
    () => c.find(q, o).toArray(),
    (e: MongoError) => e
  );

export const insertMany = <A>(
  ds: RNEA.ReadonlyNonEmptyArray<OptionalId<A>>,
  o?: CollectionInsertManyOptions
) => (c: Collection<A>) =>
  TE.tryCatch(
    () => c.insertMany(RA.toArray(ds), o),
    (e: MongoError) => e
  );

export const deleteMany = <A>(q: FilterQuery<A>, o?: CommonOptions) => (
  c: Collection<A>
) =>
  TE.tryCatch(
    () => c.deleteMany(q, o),
    (e: MongoError) => e
  );
