import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

const REQUEST_ID_HEADER = "x-request-id";

export function requestContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId =
    incoming && incoming.length <= 100 ? incoming : randomUUID();

  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
