/**
 * @version 0.41
 */
import { BlocksoftBlockchainTypes } from '@crypto/blockchains/BlocksoftBlockchainTypes'
import DogeSendProvider from '@crypto/blockchains/doge/providers/DogeSendProvider'
import BlocksoftCryptoLog from '@crypto/common/BlocksoftCryptoLog'

import BlocksoftAxios from '@crypto/common/BlocksoftAxios'
import config from '@app/config/config'
import BlocksoftExternalSettings from '@crypto/common/BlocksoftExternalSettings'

export default class TrxSendProvider extends DogeSendProvider implements BlocksoftBlockchainTypes.SendProvider {


    trxError(msg: string) {
        if (config.debug.cryptoErrors) {
            console.log(this._settings.currencyCode + ' TrxSendProvider ' + msg)
        }
        if (this._settings.currencyCode !== 'TRX' && msg.indexOf('AccountResourceInsufficient') !== -1) {
            throw new Error('SERVER_RESPONSE_NOT_ENOUGH_FEE')
        } else if (msg.indexOf('Validate TransferContract error, balance is not sufficient.') !== -1) {
            throw new Error('SERVER_RESPONSE_NOTHING_TO_TRANSFER_FROM_ACTUAL_NODE')
        } else if (msg.indexOf('balance is not sufficient') !== -1) {
            throw new Error('SERVER_RESPONSE_NOT_ENOUGH_FEE')
        } else if (msg.indexOf('account not exist') !== -1) {
            throw new Error('SERVER_RESPONSE_NOT_ENOUGH_FEE')
        } else if (msg.indexOf('Amount must greater than 0') !== -1) {
            throw new Error('SERVER_RESPONSE_NOT_ENOUGH_AMOUNT_AS_DUST')
        } else if (msg.indexOf('assetBalance must be greater than 0') !== -1 || msg.indexOf('assetBalance is not sufficient') !== -1) {
            throw new Error('SERVER_RESPONSE_NOTHING_TO_TRANSFER_FROM_ACTUAL_NODE')
        } else {
            throw new Error(msg)
        }
    }

    async _sendTx(tx: any, subtitle: string, txRBF: any, logData: any): Promise<{
        transactionHash: string,
        logData: any
    }> {
        await BlocksoftCryptoLog.log(this._settings.currencyCode + ' TrxSendProvider._sendTx ' + subtitle + ' started ', logData)

        const sendLink = BlocksoftExternalSettings.getStatic('TRX_SEND_LINK')
        const link = sendLink + '/wallet/broadcasttransaction'
        if (config.debug.cryptoErrors) {
            console.log(new Date().toISOString() + ' ' + this._settings.currencyCode + ' TrxSendProvider._sendTx ' + subtitle + ' started check ')
        }
        logData = await this._check(tx.raw_data_hex, subtitle, txRBF, logData)
        if (config.debug.cryptoErrors) {
            BlocksoftCryptoLog.log(new Date().toISOString() + ' ' + this._settings.currencyCode + ' TrxSendProvider._sendTx ' + subtitle + ' ended check ')
        }

        let send = false
        try {
            send = await BlocksoftAxios.post(link, tx)
        } catch (e) {
            if (config.debug.cryptoErrors) {
                console.log(this._settings.currencyCode + ' TrxSendProvider._sendTx broadcast error ' + e.message)
            }
        }

        // @ts-ignore
        if (!send || typeof send.data === 'undefined' || !send.data) {
            throw new Error('SERVER_RESPONSE_NOT_CONNECTED')
        }

        await BlocksoftCryptoLog.log(this._settings.currencyCode + ' TrxSendProvider._sendTx ' + subtitle + ' result ', send.data)

        if (typeof send.data.code !== 'undefined') {
            if (send.data.code === 'BANDWITH_ERROR') {
                throw new Error('SERVER_RESPONSE_BANDWITH_ERROR_TRX')
            } else if (send.data.code === 'SERVER_BUSY') {
                throw new Error('SERVER_RESPONSE_NOT_CONNECTED')
            }
        }

        // @ts-ignore
        if (typeof send.data.Error !== 'undefined') {
            await BlocksoftCryptoLog.log(this._settings.currencyCode + ' TrxSendProvider._sendTx error ' + send.data.Error)
            // @ts-ignore
            throw new Error(send.data.Error)
        }
        // @ts-ignore
        if (typeof send.data.result === 'undefined') {
            // @ts-ignore
            if (typeof send.data.message !== 'undefined') {
                let msg = false
                try {
                    // @ts-ignore
                    const buf = Buffer.from(send.data.message, 'hex')
                    // @ts-ignore
                    msg = buf.toString('')
                } catch (e) {
                    // do nothing
                }
                await BlocksoftCryptoLog.log(this._settings.currencyCode + ' TrxSendProvider._sendTx msg ' + msg)
                if (msg) {
                    // @ts-ignore
                    send.data.decoded = msg
                    // @ts-ignore
                    this.trxError(msg)
                }
            }
            // @ts-ignore
            this.trxError('no transaction result ' + JSON.stringify(send.data))
        } else {
            // @ts-ignore
            if (send.data.result !== true) {
                // @ts-ignore
                this.trxError('transaction result is false ' + JSON.stringify(send.data))
            }
        }

        return { transactionHash: tx.txID, logData }
    }

    async sendTx(tx: any, subtitle: string, txRBF: any, logData: any): Promise<{
        transactionHash: string,
        transactionJson: any,
        logData
    }> {
        await BlocksoftCryptoLog.log(this._settings.currencyCode + ' TrxSendProvider.sendTx ' + subtitle + ' started ', logData)

        let send = false
        let transactionHash = tx?.txID
        let e = false
        try {
            send = await this._sendTx(tx, subtitle, txRBF, logData)
            if (send && typeof send.transactionHash !== 'undefined') {
                transactionHash = send.transactionHash
            } else {
                throw new Error('no transactionHash')
            }
        } catch (e1) {
            if (config.debug.cryptoErrors) {
                console.log(this._settings.currencyCode + ' TrxSendProvider.sendTx error1 ', e1)
            }
            await BlocksoftCryptoLog.log(this._settings.currencyCode + ' TrxSendProvider.sendTx error1 ' + e1.message + ' tx ' + JSON.stringify(tx))
            e = e1
        }
        if (e) {
            const sendLink = BlocksoftExternalSettings.getStatic('TRX_SEND_LINK')
            const linkRecheck = sendLink + '/wallet/gettransactioninfobyid'
            let checks = 0
            let mined = false
            do {
                checks++
                try {
                    const recheck = await BlocksoftAxios.post(linkRecheck, {
                        value: '1e4953eb95fc90d15e5f03f38d1c35bb5adf0ca920bf3de4582c2f95dc56f628'
                    })
                    if (typeof recheck.data !== 'undefined') {
                        if (typeof recheck.data.id !== 'undefined' && typeof recheck.data.blockNumber !== 'undefined'
                            && typeof recheck.data.receipt !== 'undefined' && typeof recheck.data.receipt.result !== 'undefined'
                        ) {

                            // @ts-ignore
                            BlocksoftCryptoLog.log(this._settings.currencyCode + ' TrxTransferProcessor.sendTx recheck on error ', {
                                id: recheck.data.id,
                                blockNumber: recheck.data.blockNumber,
                                receipt: recheck.data.receipt
                            })
                            mined = true
                            const minedStatus = recheck.data.receipt.result.toUpperCase()
                            if (minedStatus === 'OUT_OF_ENERGY') {
                                e = new Error(`account.transactionStatuses.out_of_energy`)
                            } else if (minedStatus === 'FAILED') {
                                e = new Error(`account.transactionStatuses.fail`)
                            } else if (minedStatus === 'SUCCESS') {
                                e = false
                            }
                            break
                        }
                    }
                } catch (e1) {
                    if (config.debug.cryptoErrors) {
                        console.log(this._settings.currencyCode + ' TRX transaction recheck error ', e1)
                    }
                }
            } while (checks < 10 && !mined)
        }

        if (e) {
            if (config.debug.cryptoErrors) {
                console.log(this._settings.currencyCode + ' TrxSendProvider.sendTx error2 ', e)
            }
            BlocksoftCryptoLog.log(this._settings.currencyCode + ' TrxSendProvider.sendTx error2 ' + e.message + ' tx ' + JSON.stringify(tx))
            try {
                logData.error = e.message + ' tx ' + JSON.stringify(tx?.txID) + ' send ' + JSON.stringify(send)
                await this._checkError(tx.raw_data_hex, subtitle, txRBF, logData)
            } catch (e2) {
                if (config.debug.cryptoErrors) {
                    console.log(this._settings.currencyCode + ' TrxSendProvider.send proxy error errorTx ' + e.message)
                }
                await BlocksoftCryptoLog.log(this._settings.currencyCode + ' TrxSendProvider.send proxy error errorTx ' + e2.message)
            }
            throw e
        }

        try {
            logData = await this._checkSuccess(transactionHash, tx.raw_data_hex, subtitle, txRBF, logData)
        } catch (e) {
            throw new Error(e.message + ' in _checkSuccess wrapped TRX')
        }
        return { transactionHash, transactionJson: {}, logData }
    }
}
