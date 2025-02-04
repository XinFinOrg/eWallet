import ObservableStore from 'obs-store'
import log from 'loglevel'
import { normalize as normalizeAddress } from 'eth-sig-util'
import ethUtil from 'ethereumjs-util'

// By default, poll every 3 minutes
const DEFAULT_INTERVAL = 180 * 1000

/**
 * A controller that polls for token exchange
 * rates based on a user's current token list
 */
export default class TokenRatesController {

  /**
   * Creates a TokenRatesController
   *
   * @param {Object} [config] - Options to configure controller
   */
  constructor ({ currency, preferences } = {}) {
    this.store = new ObservableStore()
    this.currency = currency
    this.preferences = preferences
  }

  convert (address, prefix = '0x') {
    if (prefix === '0x') {
      const start = address?.slice(0, 3)
      return start.toLowerCase() === 'xdc' ? (`0x${address.substring(3)}`) : address
    }
    const start = address?.slice(0, 2)
    return start.toLowerCase() === '0x' ? (`xdc${address.substring(2)}`) : address
  }
  /**
   * Updates exchange rates for all tokens
   */
  async updateExchangeRates () {
    const contractExchangeRates = {}
    const nativeCurrency = this.currency ? this.currency.state.nativeCurrency.toLowerCase() : 'usd'
    const pairs = this._tokens.map((token) => this.convert(token.address, 'xdc')).join(',')
    const query = `contract_addresses=${pairs}&vs_currencies=${nativeCurrency}`
    if (this._tokens.length > 0) {
      try {
        const response = await window.fetch(`https://api.coingecko.com/api/v3/simple/token_price/xdc-network?${query}`)
        const prices = await response.json()
        this._tokens.forEach((token) => {
          const price = prices[token.address.toLowerCase()] || prices[ethUtil.toChecksumAddress(token.address)]
          contractExchangeRates[normalizeAddress(token.address)] = price ? price[nativeCurrency] : 0
        })
      } catch (error) {
        log.warn(`XDCPay - TokenRatesController exchange rate fetch failed.`, error)
      }
    }
    this.store.putState({ contractExchangeRates })
  }

  /**
   * @type {Object}
   */
  set preferences (preferences) {
    this._preferences && this._preferences.unsubscribe()
    if (!preferences) {
      return
    }
    this._preferences = preferences
    this.tokens = preferences.getState().tokens
    preferences.subscribe(({ tokens = [] }) => {
      this.tokens = tokens
    })
  }

  /**
   * @type {Array}
   */
  set tokens (tokens) {
    this._tokens = tokens
    this.updateExchangeRates()
  }

  start (interval = DEFAULT_INTERVAL) {
    this._handle && clearInterval(this._handle)
    if (!interval) {
      return
    }
    this._handle = setInterval(() => {
      this.updateExchangeRates()
    }, interval)
    this.updateExchangeRates()
  }

  stop () {
    this._handle && clearInterval(this._handle)
  }
}
