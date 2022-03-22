#include <eosio/eosio.hpp>
#include <eosio/transaction.hpp>

using namespace eosio;

class [[eosio::contract]] timer : public contract {
public:
   using contract::contract;

   [[eosio::action]]
   void exec(name owner)
   {
      require_auth(owner);
      auto l = current_time_point();
      auto a = current_time_point().time_since_epoch().count();
      print(a);
   }
};
