import { Telegraf, Telegram } from "telegraf";
import { TelegrafOptions } from "telegraf/typings/telegraf";
import { TelegramOptions } from "telegraf/typings/telegram";
import * as TE from "fp-ts/lib/TaskEither";
import { TelegramError } from "telegraf/core/network/error";
import type {
  ExtraEditMessage,
  ExtraPhoto,
  InputFile,
  Message,
  MessagePhoto,
} from "telegraf/typings/telegram-types";

export const telegraf = (t: string, o?: TelegrafOptions) => new Telegraf(t, o);

export const telegram = (t: string, o?: TelegramOptions) => new Telegram(t, o);

type ChatIdT = string | number;

export const sendMessage = (
  chatId: ChatIdT,
  text: string,
  extra: ExtraEditMessage
) => (ti: Telegram): TE.TaskEither<TelegramError, Message> =>
  TE.tryCatch(
    () => ti.sendMessage(chatId, text, extra),
    (e: TelegramError) => e
  );

export const sendPhoto = (
  chatId: ChatIdT,
  photo: InputFile,
  extra: ExtraPhoto
) => (ti: Telegram): TE.TaskEither<TelegramError, MessagePhoto> =>
  TE.tryCatch(
    () => ti.sendPhoto(chatId, photo, extra),
    (e: TelegramError) => e
  );
