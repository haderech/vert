#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] n111 : public contract {
public:
   using contract::contract;

   [[eosio::on_notify("*::send")]]
   void send(int64_t value)
   {
      print(" 3 ");
   }

   [[eosio::action]]
   void abc(int64_t value){}
};
