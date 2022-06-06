#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] i1211 : public contract {
public:
   using contract::contract;

   [[eosio::action]]
   void send(int64_t value)
   {
      print(" 7 ");
   }
};