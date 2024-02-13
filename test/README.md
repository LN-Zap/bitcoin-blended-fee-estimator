# Testing

Start the docker stack with the following command:

```bash
cd test/fixtures && docker-compose up
```

To fill the mempool, exec onto the container and run the `init.sh` script:

```bash
docker exec -it bitcoin-blended-fee-estimator-bitcoind-1 bash
/init.sh
```

Run the app with test config:

```bash
NODE_ENV=test bun run dev
```

Run commands against the running docker stack:

```bash
./test/fixtures/bitcoin-cli estimatesmartfee 2
```

Stop and cleanup the docker stack:

```bash
docker-compose down --volumes
```