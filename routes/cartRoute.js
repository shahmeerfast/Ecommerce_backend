import express from 'express'
import { addToCart, getUserCart, updateCart } from '../controllers/cartController.js'
import { isAuthenticated } from '../middleware/auth.js'

const cartRouter = express.Router()

cartRouter.post('/get', isAuthenticated, getUserCart)
cartRouter.post('/add', isAuthenticated, addToCart)
cartRouter.post('/update', isAuthenticated, updateCart)

export default cartRouter