Follow the guide of [Installing locally from source](https://hyperledger.github.io/caliper/vNext/installing-caliper/#installing-locally-from-source)

0.start odyssey.

1.To install the basic dependencies of the repository.

`user@ubuntu:~/caliper$ npm i && rm -rf ./node_modules/@hyperledger/* && cp -R ./packages/* ./node_modules/@hyperledger/`

2.To run the CI process locally.
```shell
cd caliper
BENCHMARK=odyssey ./.travis/benchmark-integration-test-run.sh
```

3.Likely result , part of terminal log
```
+----------+------+------+-----------------+-----------------+-----------------+-----------------+------------------+
| Name     | Succ | Fail | Send Rate (TPS) | Max Latency (s) | Min Latency (s) | Avg Latency (s) | Throughput (TPS) |
|----------|------|------|-----------------|-----------------|-----------------|-----------------|------------------|
| open     | 100  | 0    | 10.2            | 1.09            | 1.01            | 1.02            | 9.2              |
|----------|------|------|-----------------|-----------------|-----------------|-----------------|------------------|
| query    | 200  | 0    | 10.1            | 0.01            | 0.00            | 0.00            | 10.1             |
|----------|------|------|-----------------|-----------------|-----------------|-----------------|------------------|
| transfer | 100  | 0    | 8.1             | 1.02            | 1.01            | 1.01            | 7.5              |
+----------+------+------+-----------------+-----------------+-----------------+-----------------+------------------+

```
