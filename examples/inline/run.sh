array=(
    "r1" r2
    i11 i14 i21 i112 i121 i131 i141 i1211 i1222
    n12 n13 n22 n111 n122 n132 n142 n1212 n1221
)

# for i in "${array[@]}"
# do
#    : 
#     blanc++ ./src/$i.cpp -o ./output/$i.wasm;
#     cleos create account eosio $i PUB_K1_74NYD4McbP8x6VHuYWGYvVedtodCgCEVsLwLknfJwzX7MASJ8a;
#     cleos set contract $i ./output $i.wasm $i.abi;
#     cleos set account permission $i active --add-code;
# done

cleos push transaction '{
  "actions": [
    {
      "account": "r1",
      "name": "send",
      "authorization": [{
          "actor": "eosio",
          "permission": "active"
        }
      ],
      "data": {
        "value": "3",
      }
    },
    {
      "account": "r2",
      "name": "send",
      "authorization": [{
          "actor": "eosio",
          "permission": "active"
        }
      ],
      "data": {
        "value": 3,
      }
    }
  ]
}' | jq '.processed.action_traces |= sort_by(.receipt.global_sequence) | .processed.action_traces | map(.console) | join("")' 