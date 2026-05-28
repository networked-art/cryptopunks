/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import AuthController from '#controllers/auth_controller'
import AccountController from '#controllers/account_controller'
import SearchesController from '#controllers/searches_controller'
import InquiriesController from '#controllers/inquiries_controller'
import AdminInquiriesController from '#controllers/admin/inquiries_controller'

router.get('/health', () => ({ ok: true }))

/**
 * Auth — SIWE + email PIN, bearer-token based.
 */
router.get('/auth/nonce', [AuthController, 'nonce'])
router.post('/auth/siwe/verify', [AuthController, 'siweVerify'])
router.post('/auth/email/request', [AuthController, 'emailRequest'])
router.post('/auth/email/verify', [AuthController, 'emailVerify'])

router
  .group(() => {
    router.get('/auth/me', [AuthController, 'me'])
    router.post('/auth/signout', [AuthController, 'signOut'])

    /**
     * Account — linking email/addresses, settings.
     */
    router.post('/account/email', [AccountController, 'requestEmail'])
    router.post('/account/email/verify', [AccountController, 'verifyEmail'])
    router.delete('/account/email', [AccountController, 'removeEmail'])

    router.post('/account/addresses', [AccountController, 'addAddress'])
    router.delete('/account/addresses/:address', [AccountController, 'removeAddress'])
    router.patch('/account/addresses/:address/primary', [AccountController, 'setPrimaryAddress'])

    router.get('/account/settings', [AccountController, 'getSettings'])
    router.patch('/account/settings', [AccountController, 'updateSettings'])

    /**
     * Saved searches.
     */
    router.get('/searches', [SearchesController, 'index'])
    router.post('/searches', [SearchesController, 'store'])
    router.get('/searches/:id', [SearchesController, 'show'])
    router.patch('/searches/:id', [SearchesController, 'update'])
    router.delete('/searches/:id', [SearchesController, 'destroy'])
    router.get('/searches/:id/matches', [SearchesController, 'matches'])

    /**
     * Inquiries — buy-side demand linked to a saved search.
     */
    router.get('/inquiries', [InquiriesController, 'index'])
    router.post('/inquiries', [InquiriesController, 'store'])
    router.get('/inquiries/:id', [InquiriesController, 'show'])
    router.patch('/inquiries/:id', [InquiriesController, 'update'])
    router.post('/inquiries/:id/cancel', [InquiriesController, 'cancel'])
  })
  .middleware(middleware.auth())

/**
 * Admin — open inquiry queue + status transitions.
 */
router
  .group(() => {
    router.get('/admin/inquiries', [AdminInquiriesController, 'index'])
    router.patch('/admin/inquiries/:id', [AdminInquiriesController, 'update'])
  })
  .middleware([middleware.auth(), middleware.admin()])
