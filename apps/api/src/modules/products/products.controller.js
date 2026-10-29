import * as productsService from './products.service.js';
import { createProductSchema, updateProductSchema } from './products.schema.js';

export const getAll = async (req, res, next) => {
  try {
    const { vendorId } = req.query;
    const products = await productsService.getAll(vendorId, req.user);
    res.json(products);
  } catch (error) {
    next(error);
  }
};

export const getById = async (req, res, next) => {
  try {
    const product = await productsService.getById(req.params.id, req.user);
    res.json(product);
  } catch (error) {
    next(error);
  }
};

export const create = async (req, res, next) => {
  try {
    const data = createProductSchema.parse(req.body);
    const product = await productsService.create(data, req.user);
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
};

export const update = async (req, res, next) => {
  try {
    const data = updateProductSchema.parse(req.body);
    const product = await productsService.update(req.params.id, data, req.user);
    res.json(product);
  } catch (error) {
    next(error);
  }
};

export const remove = async (req, res, next) => {
  try {
    await productsService.remove(req.params.id, req.user);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
