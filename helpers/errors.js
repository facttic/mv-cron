/* eslint-disable no-use-before-define */
const { LoggerConfig } = require("../common/logger");

class CustomError extends Error {
  constructor(message) {
    super(message);
    this.message = message;
  }

  toJSON() {
    return {
      error: {
        name: this.name,
        message: this.message,
        stacktrace: this.stack,
      },
    };
  }
}

const normalizeAndLogError = (moduleName, error) => {
  let throwable = error;

  switch (error.name) {
    case "UnexpectedError":
    case "PermissionError":
    case "MongoError":
      // catch duplicate key errors
      if (error.code === 11000) {
        throwable.statusCode = 422;
        throwable.message = "Not available or duplicated field";
        throwable.name = "NotAvailableError";
      }
      break;
    case "StrictModeError":
      throwable = new ValidationError(error.message);
      break;
    case "AuthenticationError":
      break;
    case "BadRequestError":
      break;
    case "NotFoundError":
      break;
    case "ValidationError":
      throwable = new ValidationError(error.message);
      break;
    case "AssertionError":
    case "AssertionError [ERR_ASSERTION]":
      throwable = new ValidationError(error.message);
      break;
    default:
      throwable = new UnexpectedError(error.message);
      break;
  }

  const logger = LoggerConfig.getChild(moduleName, throwable);
  // internaly log the error
  logger.error(error);

  return throwable;
};

class ValidationError extends CustomError {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

class PermissionError extends CustomError {
  constructor(message) {
    super(message);
    this.name = "PermissionError";
  }
}

class AuthenticationError extends CustomError {
  constructor(message) {
    super(message);
    this.name = "AuthenticationError";
  }
}

class UnexpectedError extends CustomError {
  constructor(message) {
    super(message);
    this.name = "UnexpectedError";
  }
}

class BadRequestError extends CustomError {
  constructor(message) {
    super(message);
    this.name = "BadRequestError";
  }
}

class NotFoundError extends CustomError {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
  }
}

module.exports = {
  ValidationError,
  PermissionError,
  AuthenticationError,
  UnexpectedError,
  BadRequestError,
  NotFoundError,
  normalizeAndLogError,
};
