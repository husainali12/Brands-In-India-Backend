const Joi = require("joi");

const createLayout = {
  body: Joi.object().keys({
    name: Joi.string().trim().optional(),
    rows: Joi.number().integer().min(1).required(),
    columns: Joi.number().integer().min(1).required(),
  }),
};

const updateSpacePrice = {
  body: Joi.object().keys({
    price: Joi.number().positive().required(),
  }),
};

module.exports = {
  createLayout,
  updateSpacePrice,
};
