#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

waitFor() {
  until $@; do
    >&2 echo "$@ unavailable - waiting..."
    sleep 1
  done
}

# bitcoin-cli() {
#   $DIR/bitcoin-cli $@
# }

createBitcoindWallet() {
  bitcoin-cli createwallet default || bitcoin-cli loadwallet default || true
}

waitForNodes() {
  waitFor bitcoin-cli getnetworkinfo
}

mineBlocks() {
  ADDRESS=$1
  AMOUNT=${2:-1}
  echo Mining $AMOUNT blocks to $ADDRESS...
  bitcoin-cli generatetoaddress $AMOUNT $ADDRESS
  sleep 0.5 # waiting for blocks to be propagated
}

generateAddresses() {
  BITCOIN_ADDRESS=$(bitcoin-cli getnewaddress)
  echo BITCOIN_ADDRESS: $BITCOIN_ADDRESS
}

initBitcoinChain() {
  mineBlocks $BITCOIN_ADDRESS 500
}

# Function to send transaction
send_transaction() {
    address="$1"
    amount="$2"
    fee_rate="$3"
    txid=$(bitcoin-cli -regtest -named sendtoaddress "$address" amount=$amount fee_rate=$fee_rate)
    echo "Transaction $txid sent to $address with fee rate $fee_rate sat/vB"
}

init() {
    # Generate addresses to send transactions to
    num_addresses=100
    addresses=()
    for ((i=0; i<num_addresses; i++)); do
        address=$(bitcoin-cli -regtest getnewaddress)
        addresses+=("$address")
    done

    # Calculate number of transactions per address
    total_transactions=10000
    transactions_per_address=$((total_transactions / num_addresses))

    # Send transactions with varying fee rates to fill the mempool
    for ((i=0; i<num_addresses; i++)); do
        address="${addresses[i]}"
        for ((j=0; j<transactions_per_address; j++)); do
            amount="0.1"  # Amount to send
            fee_rate=$((($i + 2) * 5))  # Varying fee rate
            send_transaction "$address" "$amount" "$fee_rate"
        done
    done

    # Generate blocks to confirm transactions
    num_blocks=5
    bitcoin-cli -regtest -generate "$num_blocks"
    echo "$num_blocks blocks generated."

    # Request fee estimate
    num_blocks_estimate=6
    fee_estimate=$(bitcoin-cli -regtest estimatesmartfee "$num_blocks_estimate")
    echo "Estimated fee rate for $num_blocks_estimate blocks: ${fee_estimate:28:7} sat/KB"
}

main() {
  createBitcoindWallet
  waitForNodes
  generateAddresses
  initBitcoinChain
  init
}

main