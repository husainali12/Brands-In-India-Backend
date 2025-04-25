const Joi = require("joi");

const verifyToken = {
  body: Joi.object().keys({
    uid: Joi.string().required(),
  }),
};

const register = {
  body: Joi.object().keys({
    name: Joi.string().trim().required(),
    email: Joi.string().email().trim().required(),
    phone: Joi.string().trim(),
  }),
};
module.exports = {
  verifyToken,
  register,
};
