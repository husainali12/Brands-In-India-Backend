const Joi = require("joi");
const httpStatus = require("http-status");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");

const validate = (schema) => async (req, res, next) => {
  const isJsonContentType = req.is("application/json");
  const isFormDataContentType = req.is("multipart/form-data");

  if (
    Object.keys(req.body).length !== 0 &&
    !isJsonContentType &&
    !isFormDataContentType
  ) {
    return next(
      new ApiError(
        "Unsupported content type. Only JSON and form-data are supported.",
        httpStatus.UNSUPPORTED_MEDIA_TYPE
      )
    );
  }

  const validSchema = pick(schema, [
    "params",
    "query",
    "files",
    "file",
    "body",
  ]);
  const object = pick(req, Object.keys(validSchema));

  const { value, error } = Joi.compile(validSchema)
    .prefs({ errors: { label: "key" } })
    .validate(object);

  console.log("🚀 ~ validate ~ error:", req.body, req.files, error);

  if (error) {
    if (req.file) req.file.buffer = 0;
    if (Array.isArray(req.files)) {
      req.files.map((file) => {
        file.buffer = null;
      });
    }
    if (typeof req.files === "object") {
      Object.keys(req.files).forEach((key) =>
        req.files[key].map((file) => {
          file.buffer = null;
        })
      );
    }
    console.log(req.body);
    const errorMessage = error.details
      .map((details) => details.message)
      .join(", ");
    return next(new ApiError(errorMessage, httpStatus.BAD_REQUEST));
  }

  Object.assign(req, value);

  return next();
};

module.exports = validate;
