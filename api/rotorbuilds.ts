const fetch = require("node-fetch");

if (!globalThis.fetch) {
  globalThis.fetch = fetch;
}

import { NowRequest, NowResponse } from "@vercel/node";
import { pipe, flow } from "fp-ts/function";
import { fetchText } from "fp-fetch";
import * as T from "fp-ts/Task";
import * as IO from "fp-ts/IO";
import * as Console from "fp-ts/Console";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RT from "fp-ts/ReaderTask";
import * as RA from "fp-ts/ReadonlyArray";
import { ConstructorOptions, JSDOM } from "jsdom";
import { Feed } from "feed";

const jsdom = (o: ConstructorOptions) => (s: string) => new JSDOM(s, o);

const ioResponse = (response: NowResponse) => (statusCode: number) => <A>(
  a: A
): IO.IO<NowResponse> => () => response.status(statusCode).send(a);

const pageUrl = () => "https://rotorbuilds.com/builds";

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

export default handler(
  pipe(
    RTE.fromTaskEither<HandlerContext, Error, string>(
      pipe(pageUrl(), fetchText)
    ),
    RTE.map(
      flow(
        jsdom({ url: pageUrl() }),
        (dom) =>
          Array.from(dom.window.document.querySelectorAll("#act_list > div")),
        RA.map((el) => ({
          img: el.querySelector("img").src,
          link: el.querySelector("a").href,
          name: el.querySelector(".act-title").textContent,
          user: el.querySelector(".act-user").textContent,
        }))
      )
    ),
    RTE.map((as) => {
      const feed = new Feed({
        title: "Rotorbuilds",
        id: "https://rotorbuilds.com/",
        link: "https://rotorbuilds.com/",
        language: "en",
        copyright: "All rights reserved",
      });
      as.forEach(({ img, link, name, user }) => {
        feed.addItem({
          title: `${name} ${user}`,
          id: link,
          link: link,
          date: new Date(),
          image: img,
        });
      });
      return feed.rss2();
    }),
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
              response.setHeader("Content-Type", "application/rss+xml");
              return response.status(200).send(s);
            })
          )
        )
    )
  )
);
