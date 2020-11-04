const fetch = require("node-fetch");

if (!globalThis.fetch) {
  globalThis.fetch = fetch;
}

import { NowRequest, NowResponse } from "@vercel/node";
import { pipe, flow } from "fp-ts/function";
import { fetchText } from "fp-fetch";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import * as IO from "fp-ts/IO";
import * as Console from "fp-ts/Console";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RT from "fp-ts/ReaderTask";
import * as RA from "fp-ts/ReadonlyArray";
import { ConstructorOptions, JSDOM } from "jsdom";
import * as mongo from "../mongo";
import { FilterQuery } from "mongodb";
import * as Eq from "fp-ts/lib/Eq";
import { sendPhoto, telegram } from "../tg";
import { Extra } from "telegraf";

const jsdom = (o: ConstructorOptions) => (s: string) => new JSDOM(s, o);

const ioResponse = (response: NowResponse) => (statusCode: number) => <A>(
  a: A
): IO.IO<NowResponse> => () => response.status(statusCode).send(a);

const MONGO_URI = process.env.MONGO_URI;
const pageUrl = () => "https://rotorbuilds.com/builds";
const chatId = () => Number(process.env.CHAT_ID);
const telegramToken = () => process.env.TELEGRAM_TOKEN;
const dbName = () => "vercel-lambdas";
const collectionName = () => "rotorbuilds-posts";

type HandlerContext = {
  request: NowRequest;
  response: NowResponse;
};

const handler = (rt: RT.ReaderTask<HandlerContext, NowResponse>) => (
  request: NowRequest,
  response: NowResponse
): void => {
  RT.run(rt, { request, response });
};

type RBPost = {
  img: string;
  link: string;
  name: string;
  author: string;
};

const getLatestBuilds = (
  url: string
): TE.TaskEither<Error, ReadonlyArray<RBPost>> =>
  pipe(
    url,
    fetchText,
    TE.map(
      flow(
        jsdom({ url }),
        (dom) =>
          Array.from(dom.window.document.querySelectorAll("#act_list > div")),
        // Looks like there should be a code which validate if markup is of for parsing purposes
        RA.map((el) => ({
          img: el.querySelector("img").src,
          link: el.querySelector("a").href,
          name: el.querySelector(".act-title").textContent,
          author: el.querySelector(".act-user").textContent,
        }))
      )
    )
  );

const useMongo = mongo.useMongo(MONGO_URI);

const existingPostsQuery = (
  posts: ReadonlyArray<RBPost>
): FilterQuery<RBPost> =>
  pipe(
    posts,
    RA.map(({ link }) => link),
    RA.toArray,
    (links) => ({
      link: {
        $in: links,
      },
    })
  );

const rbPostEq: Eq.Eq<RBPost> = Eq.getStructEq({
  link: Eq.eqString,
});

export default handler(
  pipe(
    // get latest posts
    RTE.fromTaskEither<HandlerContext, Error, ReadonlyArray<RBPost>>(
      getLatestBuilds(pageUrl())
    ),
    RTE.chainTaskEitherK((posts) =>
      useMongo(
        flow(
          // filter out posts that already sent to channel
          mongo.db(dbName()),
          mongo.collection<RBPost>(collectionName()),
          (collection) =>
            pipe(
              collection,
              mongo.find(existingPostsQuery(posts)),
              TE.map(RA.fromArray),
              TE.map((existingPosts) =>
                RA.difference(rbPostEq)(existingPosts)(posts)
              ),
              // send them to tg
              TE.chainFirst(
                flow(
                  RA.map((post) =>
                    pipe(
                      telegram(telegramToken()),
                      sendPhoto(
                        chatId(),
                        post.img,
                        // I have no idea what's going on with Extra here
                        // @ts-ignore
                        Extra.caption(
                          `<b>${post.name}</b>\n${post.author}\n\n<a href="${post.link}">${post.link}</a>`
                        ).HTML(true)
                      )
                    )
                  ),
                  RA.sequence(TE.taskEitherSeq)
                )
              ),
              // and finally save them to db
              TE.chainFirst((posts) =>
                RA.isNonEmpty(posts)
                  ? mongo.insertMany(posts)(collection)
                  : TE.right({})
              )
            )
        )
      )
    ),
    RTE.fold(
      (e) => ({ response }) =>
        T.fromIO(
          pipe(
            Console.error(e),
            IO.chain(() => ioResponse(response)(500)("Internal server error"))
          )
        ),
      (s) => ({ response }) =>
        T.fromIO(
          pipe(
            Console.log(s),
            IO.chain(() => () => {
              response.setHeader("Content-Type", "application/json");
              return response.status(200).send(s);
            })
          )
        )
    )
  )
);
